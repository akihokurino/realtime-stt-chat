from __future__ import annotations

import asyncio
import logging
import os
from asyncio import AbstractEventLoop
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from queue import Queue, Empty
from threading import Timer
from typing import Any, Dict, Final, Generator, Optional

import socketio
from google.cloud import speech

STT_API_KEY: Optional[str] = os.getenv("STT_API_KEY")
client: Final[speech.SpeechClient] = speech.SpeechClient(
    client_options={"api_key": STT_API_KEY}
)

sio: Final[socketio.AsyncServer] = socketio.AsyncServer(
    async_mode="asgi", cors_allowed_origins="*"
)
sio_app: Final[socketio.ASGIApp] = socketio.ASGIApp(sio, socketio_path="/ws/socket.io")


class AudioBuffer:
    def __init__(self) -> None:
        self.queue: Queue[Optional[bytes]] = Queue()
        self.closed: bool = False

    def write(self, data: bytes) -> None:
        self.queue.put(data)

    def generator(self) -> Generator[bytes, None, None]:
        while not self.closed:
            try:
                chunk: Optional[bytes] = self.queue.get()
            except Empty:
                continue
            if chunk is None:
                return
            data = [chunk]
            while True:
                try:
                    chunk = self.queue.get(block=False)
                    if chunk is None:
                        return
                    data.append(chunk)
                except Empty:
                    break
            yield b"".join(data)

    def close(self) -> None:
        self.closed = True
        self.queue.put(None)


@dataclass
class ConnectionState:
    sid: str
    buffer: AudioBuffer = field(default_factory=AudioBuffer)
    transcript: str = ""
    timeout: Optional[Timer] = None
    loop: Optional[AbstractEventLoop] = None


connections: Dict[str, ConnectionState] = {}


async def stop_stream(sid: str) -> None:
    connection: Optional[ConnectionState] = connections.pop(sid, None)
    if connection is None:
        return

    if connection.timeout is not None:
        connection.timeout.cancel()
        connection.timeout = None

    connection.buffer.close()
    try:
        await sio.disconnect(sid)
        print(f"✅ Disconnect {sid}")
    except Exception as e:
        print(f"❌ Disconnect error for {sid}: {e}")


executor = ThreadPoolExecutor(max_workers=5)


@sio.event  # type: ignore
async def connect(sid: str, environ: Dict[str, Any]) -> None:
    print(f"✅ Client connected: {sid}")
    connections[sid] = ConnectionState(sid=sid, loop=asyncio.get_running_loop())
    # asyncio.create_task(process_audio_stream(sid))
    # asyncio.create_task(asyncio.to_thread(process_audio_stream, sid))
    loop = asyncio.get_running_loop()
    loop.run_in_executor(executor, process_audio_stream, sid)


@sio.event  # type: ignore
async def mic(sid: str, data: bytes) -> None:
    print(f"🎤 Audio data received: {sid}")
    connection: Optional[ConnectionState] = connections.get(sid)
    if connection is not None:
        connection.buffer.write(data)


@sio.event  # type: ignore
async def stop(sid: str) -> None:
    print(f"☑️ Stop requested: {sid}")
    await stop_stream(sid)


@sio.event  # type: ignore
async def disconnect(sid: str) -> None:
    print(f"☑️ Client disconnected: {sid}")
    await stop_stream(sid)


async def process_audio_stream(sid: str) -> None:
    """
    音声認識処理を行うバックグラウンドタスク
    :param sid:
    :return:
    """
    print(f"🔊 Start audio stream for {sid}")
    connection: Optional[ConnectionState] = connections.get(sid)
    if connection is None:
        return

    config: speech.RecognitionConfig = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=16000,
        language_code="ja-JP",
        max_alternatives=1,
    )
    streaming_config: speech.StreamingRecognitionConfig = (
        speech.StreamingRecognitionConfig(config=config, interim_results=True)
    )
    generator = connection.buffer.generator()
    requests = (
        speech.StreamingRecognizeRequest(audio_content=chunk) for chunk in generator
    )

    try:
        responses = client.streaming_recognize(
            config=streaming_config, requests=requests
        )
        for response in responses:
            if response.error.code != 0:
                logging.error(f"Error occurred for {sid}: {response.error.message}")
                await stop_stream(sid)
                return

            if not response.results:
                continue

            result = response.results[0]
            if not result.alternatives:
                continue

            connection.transcript = result.alternatives[0].transcript
            print(f"✅ Transcript for {sid}: {connection.transcript}")
            await sio.emit("transcript", connection.transcript, to=sid)

            # タイマーの再設定（1秒間音声が来なければストリームを停止）
            if connection.timeout is not None:
                connection.timeout.cancel()

            connection.timeout = Timer(
                1,
                lambda: connection.loop.call_soon_threadsafe(
                    asyncio.create_task, stop_stream(sid)
                ),
            )
            connection.timeout.start()

        # responses のループが終了した場合
        if connection.timeout is None:
            await stop_stream(sid)

        print(f"☑️ Finish transcript for {sid}")
    except Exception as e:
        logging.error(f"Exception occurred for {sid}: {e}")
        await stop_stream(sid)
