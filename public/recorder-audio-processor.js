//常量
const params = {
    inputSampleRate: 48000,//输入采样率,网页默认的采样率即为48000
    inputSampleBits: 16, //输入采样数位16
    outputSampleRate: 16000, //输出采样率
    oututSampleBits: 16, //输出采样数位
    compression: 48000 / 16000
}

/**
 * 录音机处理器
 */
class RecorderAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.audioData = {
            size: 0, //录音文件长度
            buffer: [], //录音缓存
            counter: 0,
            clear: function () {
                this.buffer = [];
                this.size = 0;
                this.counter = 0;
            },
            input: function (data) {
                this.buffer.push(new Float32Array(data));
                this.size += data.length;
            },
            compress: function () { //合并压缩
                let data = new Float32Array(this.size);
                let offset = 0;
                for (let i = 0; i < this.buffer.length; i++) {
                    data.set(this.buffer[i], offset);
                    offset += this.buffer[i].length;
                }
                //压缩
                let length = data.length / params.compression;
                let result = new Float32Array(length);
                let index = 0,
                    j = 0;
                while (index < length) {
                    result[index] = data[j];
                    j += params.compression;
                    index++;
                }
                return result;
            },
            encodePCM: function () { //这里不对采集到的数据进行其他格式处理，如有需要均交给服务器端处理。
                let sampleBits = Math.min(params.inputSampleBits, params.oututSampleBits);
                let bytes = this.compress();
                let dataLength = bytes.length * (sampleBits / 8);
                let buffer = new ArrayBuffer(dataLength);
                let data = new DataView(buffer);
                let offset = 0;
                for (let i = 0; i < bytes.length; i++, offset += 2) {
                    let s = Math.max(-1, Math.min(1, bytes[i]));
                    //将采样值归一化到16位有符号整数范围内的操作。这里0x8000和0x7FFF是16位有符号整数的最大值，也就是32768和32767
                    data.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                }

                return data.buffer;
            }

        }
    }

    process(inputs, outputs, parameters) {
        //每次采集数据128个样本
        this.audioData.input(inputs[0][0]);
        this.audioData.counter++;
        //这个步骤很关键， 凑够4096个样本点才处理。如果没有这个步骤，会出问题
        if (this.audioData.counter >= 32) {
            this.sendData()
            this.audioData.clear();//每次发送完成则清理掉旧数据
        }
        return true;
    }

    // 注意， 这里没有直接把数据发送回后端，因为worker线程不允许操作websocket。只能通过postMessage机制把数据回传主线程。
    sendData() {
        let arr = new Int8Array(this.audioData.encodePCM());

        if (arr.length > 0) {
            let tmparr = new Int8Array(1024);
            let j = 0;
            for (let i = 0; i < arr.byteLength; i++) {
                tmparr[j++] = arr[i];
                if (((i + 1) % 1024) === 0) {
                    this.port.postMessage(tmparr.buffer, [tmparr.buffer]);
                    if (arr.byteLength - i - 1 >= 1024) {
                        tmparr = new Int8Array(1024);
                    } else {
                        tmparr = new Int8Array(arr.byteLength - i - 1);
                    }
                    j = 0;
                }
                if ((i + 1 === arr.byteLength) && ((i + 1) % 1024) !== 0) {
                    this.port.postMessage(tmparr.buffer, [tmparr.buffer]);
                }
            }
        }
    }
}

//注册worklet
registerProcessor('recorder-audio-processor', RecorderAudioProcessor);