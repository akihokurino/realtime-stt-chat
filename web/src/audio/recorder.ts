import {isSafari} from "@/util";
import {createEncorder} from "./encorder";

const numChannels = 1;
const mimeType = "audio/wav";
const silenceThreshold = 0.01; // 停止判定の閾値（ここを調整する）
const silenceDuration = 10000;

class Recorder {
    silenceTimeoutId: NodeJS.Timeout | null = null;
    soundDetected: boolean = false;
    encorder: Worker | null = null;
    recording: boolean = false;
    audioWorkletNode: AudioWorkletNode | null = null;
    public readonly stream: ReadableStream<{ event: "data" | "punctuation", data: any }>;

    // scriptProcessorNode: ScriptProcessorNode | null = null;

    constructor(stream: MediaStream, onExportWAV: (data: Blob) => void) {
        const self = this;
        this.stream = new ReadableStream<any>({
            async start(controller) {
                const audioContext = new AudioContext({
                    sampleRate: 16000,
                });
                await audioContext.resume();
                const source = audioContext.createMediaStreamSource(stream);

                self.encorder = createEncorder();
                self.encorder!.postMessage({
                    command: "init",
                    config: {
                        sampleRate: source.context.sampleRate,
                        numChannels: numChannels,
                        isSafari: isSafari(),
                    },
                });
                self.encorder!.onmessage = (e: MessageEvent) => {
                    switch (e.data.command) {
                        case "exportWAV":
                            onExportWAV(e.data.data);
                            break;
                    }
                };

                const processBuffer = async (buffer: Float32Array[]) => {
                    let sum = 0;
                    for (let i = 0; i < buffer[0].length; i++) {
                        sum += buffer[0][i] * buffer[0][i];
                    }

                    const rms = Math.sqrt(sum / buffer[0].length);

                    if (rms < silenceThreshold) {
                        if (!self.soundDetected) {
                            return;
                        }

                        if (!self.silenceTimeoutId) {
                            self.silenceTimeoutId = setTimeout(async () => {
                                controller.enqueue({event: "punctuation"});
                                self.encorder?.postMessage({
                                    command: "exportWAV",
                                    type: mimeType,
                                });
                                await self.stop();
                                self.soundDetected = false;
                            }, silenceDuration);
                        }
                    } else {
                        self.soundDetected = true;

                        if (self.silenceTimeoutId) {
                            clearTimeout(self.silenceTimeoutId);
                            self.silenceTimeoutId = null;
                        }
                    }

                    controller.enqueue({event: "data", data: buffer});

                    self.encorder?.postMessage({
                        command: "record",
                        buffer: buffer,
                    });
                };

                // ScriptProcessorNodeを使った場合（一応残す）
                // this.scriptProcessorNode = source.context.createScriptProcessor(
                //   4096,
                //   numChannels,
                //   numChannels
                // );
                // this.scriptProcessorNode.onaudioprocess = (e: AudioProcessingEvent) => {
                //   if (!this.recording) return;
                //   const buffer: Float32Array[] = [];
                //   for (let channel = 0; channel < numChannels; channel++) {
                //     buffer.push(e.inputBuffer.getChannelData(channel));
                //   }
                //   processBuffer(buffer);
                // };
                // source.connect(this.scriptProcessorNode);
                // this.scriptProcessorNode.connect(source.context.destination);

                // AudioWorkletNodeを使った場合
                audioContext.audioWorklet
                    .addModule(`${process.env.PUBLIC_URL}/processor.js`)
                    .then(() => {
                        self.audioWorkletNode = new AudioWorkletNode(audioContext, "processor");
                        source.connect(self.audioWorkletNode);

                        self.audioWorkletNode!.port.onmessage = async (event) => {
                            if (event.data.command === "record") {
                                const buffer: Float32Array[] = event.data.buffer;
                                await processBuffer(buffer);
                            }
                        };
                    });
            }
        })
    }

    start = () => {
        console.log("Recorder start");
        this.audioWorkletNode?.port.postMessage({command: "record"});
        this.recording = true;
    };

    stop = async () => {
        console.log("Recorder stop");
        this.audioWorkletNode?.port.postMessage({command: "stop"});
        this.recording = false;
        this.encorder?.postMessage({command: "clear"});
        if (this.silenceTimeoutId) {
            clearTimeout(this.silenceTimeoutId);
            this.silenceTimeoutId = null;
        }
        this.soundDetected = false;
    };
}

export default Recorder;
