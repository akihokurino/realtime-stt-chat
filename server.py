import os
from typing import Final, final, AsyncGenerator, Literal

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from openai.types.chat.chat_completion_assistant_message_param import (
    ChatCompletionAssistantMessageParam,
)
from openai.types.chat.chat_completion_message_param import ChatCompletionMessageParam
from openai.types.chat.chat_completion_user_message_param import (
    ChatCompletionUserMessageParam,
)
from pydantic import BaseModel

from stt import sio_app

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

client = OpenAI(
    api_key=OPENAI_API_KEY,
)

app: Final[FastAPI] = FastAPI(
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

main_app = FastAPI()
main_app.mount("/ws", sio_app)
main_app.mount("/", app)


@final
class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


@final
class _ChatCompletionPayload(BaseModel):
    messages: list[Message]


@final
class _Empty(BaseModel):
    pass


async def _chat_completion_stream(
    payload: _ChatCompletionPayload,
) -> AsyncGenerator[str, None]:
    messages: list[ChatCompletionMessageParam] = []
    for message in payload.messages:
        if message.role == "assistant":
            messages.append(
                ChatCompletionAssistantMessageParam(
                    role="assistant",
                    content=message.content,
                )
            )
        if message.role == "user":
            messages.append(
                ChatCompletionUserMessageParam(
                    role="user",
                    content=message.content,
                )
            )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        stream=True,
    )

    for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


@app.post("/chat_completion")
async def _chat_completion(
    payload: _ChatCompletionPayload,
) -> StreamingResponse:
    return StreamingResponse(_chat_completion_stream(payload), media_type="text/plain")


@app.post("/stt")
async def handshake() -> _Empty:
    return _Empty()


if __name__ == "__main__":
    uvicorn.run(main_app, host="0.0.0.0", port=8080, log_level="debug")
