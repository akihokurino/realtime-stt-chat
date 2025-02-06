type Message = {
    role: "user" | "assistant";
    content: string;
};

export const chatCompletionsAPI = async (
    messages: Message[],
    received: (text: string) => void,
    finish: () => void
) => {
    const response = await fetch(
        "http://localhost:8080/chat_completion",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(messages),
        }
    );

    if (!response.body) {
        throw new Error("ReadableStream not yet supported in this browser.");
    }

    const reader = response.body.getReader();

    const processChunk = async ({
                                    done,
                                    value
                                }: ReadableStreamReadResult<Uint8Array>): Promise<void> => {
        if (done) {
            finish();
            return;
        }

        const text = new TextDecoder().decode(value);
        received(text);

        reader.read().then(processChunk);
    };

    reader.read().then(processChunk);
};
