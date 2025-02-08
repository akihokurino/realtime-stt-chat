import Recorder from "@/audio/recorder";
import {io, Socket} from "socket.io-client";

export class STT {
    recorder: Recorder;
    transcript: string = "";
    socket: Socket | null = null;
    onUpdated: (transcript: string) => void = () => {
    };
    onFinish: (transcript: string) => void = () => {
    };

    constructor(
        recorder: Recorder,
        onUpdated: (transcript: string) => void,
        onFinish: (transcript: string) => void
    ) {
        this.recorder = recorder;
        this.onUpdated = onUpdated;
        this.onFinish = onFinish;

        const self = this;
        this.recorder.stream.pipeTo(new WritableStream<any>({
            async write(event) {
                switch (event.event) {
                    case "data":
                        const l16 = self.floatTo16BitPCM(event.data[0]);
                        console.log("stt:data");
                        // console.log("onWrite", l16);
                        self.socket?.emit("mic", l16);
                        break;
                    case "punctuation":
                        console.log("stt:punctuation");
                        self.socket?.emit("stop");
                        break;
                }
            }
        }));
    }

    async warmup() {
        console.log("start warmup");

        if (this.socket) {
            console.log("already connected");
            return;
        }

        await fetch("http://localhost:8080/stt", {
            method: "POST", headers: {}
        })
            .then(async () => {
                if (!this.socket) {
                    this.socket = io("http://localhost:8080", {
                        autoConnect: true,
                        path: "/ws/socket.io",
                        transports: ["websocket", "polling"]
                    });
                }

                this.socket.on("connect", () => {
                    console.log("✅ Connected to server!");
                });
                this.socket.on("connect_error", (error) => {
                    console.error("Connection failed:", error);
                });

                this.socket.on("transcript", (transcript: string) => {
                    this.transcript = transcript;
                    console.log(`✅ transcript: ${transcript}`);
                    this.onUpdated(transcript);
                });

                this.socket.on("disconnect", async () => {
                    console.log("❌ Disconnected from server!");
                    await this.doFinish();
                });
            })
            .catch(async (e) => {
                console.error(e);
                await this.doFinish();
            })
    }

    async start() {
        await this.warmup();
        this.recorder.start()
    }

    async stop() {
        console.log("stop");
        this.socket?.emit("stop");
    }

    private async doFinish() {
        console.log("doFinish");
        await this.recorder.stop();
        this.socket?.disconnect();
        this.socket = null;
        this.onFinish(this.transcript);
        this.transcript = "";
    }

    private floatTo16BitPCM(
        input: Float32Array
    ): Uint16Array {
        const buffer = new ArrayBuffer(input.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return new Uint16Array(view.buffer);
    };
}