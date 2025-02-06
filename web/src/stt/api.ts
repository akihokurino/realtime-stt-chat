import axios from "axios";

const GCP_STT_API_KEY = process.env.REACT_APP_GCP_STT_API_KEY;

type SpeechRecognitionConfig = {
    encoding: string;
    languageCode: string;
    audioChannelCount: number;
    speechContexts: SpeechRecognitionContext[];
};

type SpeechRecognitionContext = {
    phrases: string[];
};

type SpeechRecognitionAudio = {
    content: string;
};

type SpeechRecognitionRequest = {
    config: SpeechRecognitionConfig;
    audio: SpeechRecognitionAudio;
};

export const speechRecognizeAPI = async (
    buffer: ArrayBuffer
): Promise<string> => {
    const requestBody: SpeechRecognitionRequest = {
        config: {
            encoding: "LINEAR16",
            languageCode: "ja-jp",
            audioChannelCount: 2, // WAVファイルのチャンネル数
            speechContexts: [
                {
                    phrases: [],
                },
            ],
        },
        audio: {
            content: arrayBufferToBase64(buffer),
        },
    };

    return axios
        .post(
            `https://speech.googleapis.com/v1/speech:recognize?key=${GCP_STT_API_KEY}`,
            requestBody,
            {
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                },
            }
        )
        .then((response) => {
            if (response.data.results && response.data.results.length !== 0) {
                return response.data.results[0].alternatives[0].transcript;
            } else {
                throw new Error("認識できませんでした");
            }
        });
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = "";
    const bytes = new Float32Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};
