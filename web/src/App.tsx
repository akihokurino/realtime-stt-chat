import {useEffect, useRef, useState,} from "react";
import {AiOutlineAudio, AiOutlineAudioMuted} from "react-icons/ai";
import {chatCompletionsAPI} from "@/gpt/api";
import {STT} from "@/stt/stt";
import Recorder from "@/audio/recorder";


type Message = {
    role: "user" | "assistant";
    content: string;
};

function App() {
    const [messages, setMessages] = useState([] as Message[]);
    const [recordingMessage, setRecordingMessage] = useState(null as string | null);
    const [inputText, setInputText] = useState("");
    const [isReplying, setIsReplying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSttWarmingUp, setIsSttWarmingUp] = useState(false);

    const isInitialized = useRef<boolean>(false);
    const sttRef = useRef<STT | null>(null);
    const messageUIRef = useRef<HTMLDivElement | null>(null);

    const initRecorder = async (stream: MediaStream) => {
        sttRef.current = new STT(
            new Recorder(stream, () => {
            }),
            (transcript) => {
                setRecordingMessage(transcript);
            },
            (transcript) => {
                sendMessage(transcript);
                sttRef.current?.start();
            }
        )
    };

    const sendMessage = async (text: string) => {
        if (text === "") {
            return;
        }

        setInputText("");
        setRecordingMessage(null);
        setMessages((prevMessages) => [
            ...prevMessages,
            {role: "user", content: text},
        ]);
    };

    const progressiveReply = async () => {
        setIsReplying(true);

        try {
            let chunks = "";
            const sentences: string[] = [];
            const context = messages.slice(-10);
            await chatCompletionsAPI(
                context,
                (text: string) => {
                    if (!chunks) {
                        setMessages((prevMessages) => [
                            ...prevMessages,
                            {role: "assistant", content: text},
                        ]);
                    } else {
                        setMessages((prevMessages) => {
                            const lastMessageIndex = prevMessages.length - 1;
                            const updatedMessage: Message = {
                                ...prevMessages[lastMessageIndex],
                                content: prevMessages[lastMessageIndex].content + text,
                            };
                            return [
                                ...prevMessages.slice(0, lastMessageIndex),
                                updatedMessage,
                            ];
                        });
                    }

                    chunks += text;

                    if (sentences.length === 0) {
                        const sentence = detectSentence(chunks);
                        if (sentence) {
                            sentences.push(sentence);
                        }
                    } else {
                        const current = sentences.join("");
                        const next = chunks.slice(current.length, chunks.length);
                        const sentence = detectSentence(next);
                        if (sentence) {
                            sentences.push(sentence);
                        }
                    }
                },
                () => {
                    setIsReplying(false)
                }
            );
        } catch (e) {
            setIsReplying(false);
            alert(e);
        }
    };

    const detectSentence = (text: string): string | undefined => {
        const index1 = text.indexOf("。");
        const index2 = text.indexOf("？");
        const index3 = text.indexOf("!");
        const index = Math.max(index1, index2, index3);

        if (index !== -1) {
            const oneSentence = text.slice(0, index + 1);
            console.log(`detect: ${oneSentence}`);
            return oneSentence;
        }
    };

    const startRecording = async () => {
        setIsRecording(true);
        setIsSttWarmingUp(true);
        await sttRef.current?.start();
    };

    const stopRecording = async () => {
        setIsRecording(false);
        setIsSttWarmingUp(false);
        setRecordingMessage(null);
        await sttRef.current?.stop();
    };

    useEffect(() => {
        if (messageUIRef.current) {
            const scrollHeight = messageUIRef.current.scrollHeight;
            messageUIRef.current.scrollTo(0, scrollHeight);
        }

        if (
            messages.length !== 0 &&
            messages[messages.length - 1].role === "user"
        ) {
            progressiveReply().then();
        }
    }, [messages]);

    useEffect(() => {
        if (isInitialized.current) {
            return;
        }

        navigator.mediaDevices.getUserMedia({audio: true}).then(async (stream) => {
            await initRecorder(stream);
        });

        isInitialized.current = true;
    }, []);

    return (
        <div className="bg-slate-900 w-full h-screen">
            {isReplying && (
                <div
                    className="fixed flex justify-center items-center py-4 top-[50px] left-0 right-0 mx-auto w-48 rounded-xl bg-slate-900 mt-2 bg-opacity-50 z-20">
                    <div className="animate-spin h-8 w-8 bg-blue-300 rounded-xl"></div>
                    <p className="ml-5 text-white text-xs">回答中...</p>
                </div>
            )}

            <div
                style={{scrollbarWidth: "none", msOverflowStyle: "none"}}
                className="relative overflow-y-scroll max-h-screen min-h-screen md:w-[700px] w-full mx-auto px-2 py-[50px] z-10"
                ref={messageUIRef}
            >
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex ${
                            message.role === "user" ? "justify-end" : "justify-start"
                        } my-2`}
                    >
                        <div
                            className={`max-w-xs px-4 py-2 rounded-lg text-sm bg-opacity-50 ${
                                message.role === "user"
                                    ? "bg-blue-500 text-white"
                                    : "bg-gray-300 text-black"
                            }`}
                        >
                            {message.content}
                        </div>
                    </div>
                ))}
                {recordingMessage && (
                    <div className="flex justify-end my-2">
                        <div
                            className="max-w-xs px-4 py-2 rounded-lg text-sm bg-opacity-50 bg-blue-500 text-white">
                            {recordingMessage}
                        </div>
                    </div>
                )}
            </div>

            <div className="fixed bottom-0 w-full bg-gray-100 border-t border-gray-200 py-2 z-10">
                <div className="max-w-2xl mx-auto px-4 flex items-center justify-between">
                    <form
                        onSubmit={async (e) => {
                            e.preventDefault();
                            await sendMessage(inputText);
                        }}
                        className="flex flex-grow"
                    >
                        <input
                            className="w-full px-2 py-1 border rounded-lg focus:outline-none placeholder:text-slate-400 text-sm placeholder:text-sm"
                            type="text"
                            placeholder="メッセージを入力してください"
                            value={inputText}
                            onChange={(e) => {
                                setInputText(e.target.value);
                            }}
                        />

                        <button
                            disabled={isReplying}
                            className={`w-16 ml-2 px-3 py-1 text-white rounded-lg focus:outline-none text-xs ${
                                isReplying
                                    ? "bg-gray-300"
                                    : "bg-blue-500"
                            }`}
                            onClick={async () => {
                                await sendMessage(inputText);
                            }}
                        >
                            送信
                        </button>

                        {!isRecording ? (
                            <button
                                disabled={isReplying || isRecording || isSttWarmingUp}
                                className={`ml-2 px-3 py-1 text-white rounded-lg focus:outline-none ${
                                    isReplying || isRecording || isSttWarmingUp
                                        ? "bg-gray-300"
                                        : "bg-green-500"
                                }`}
                                onClick={async () => {
                                    await startRecording();
                                }}
                            >
                                <AiOutlineAudio/>
                            </button>
                        ) : (
                            <button
                                className={`ml-2 px-3 py-1 text-white rounded-lg focus:outline-none bg-red-500`}
                                onClick={async () => {
                                    await stopRecording();
                                }}
                            >
                                <AiOutlineAudioMuted/>
                            </button>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}

export default App;
