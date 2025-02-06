class Processor extends AudioWorkletProcessor {
  static parameterDescriptors = [];

  constructor() {
    super();

    this.port.onmessage = (event) => {
      if (event.data.command === "record") {
        this.isRecording = true;
      } else if (event.data.command === "stop") {
        this.isRecording = false;
      }
    };
    this.isRecording = false;
  }

  process(inputs, outputs, parameters) {
    if (!this.isRecording) {
      return true;
    }

    const input = inputs[0];
    const output = outputs[0];

    for (let channel = 0; channel < input.length; ++channel) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      for (let i = 0; i < inputChannel.length; ++i) {
        outputChannel[i] = inputChannel[i];
      }
    }

    this.port.postMessage({
      command: "record",
      buffer: output,
    });

    return true;
  }
}

registerProcessor("processor", Processor);
