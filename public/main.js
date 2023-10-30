/**
 * 检测音频输入设备是否就绪，是的话初始化websocket
 */
let initAudio = function() {
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

    if (!navigator.getUserMedia) {
        alert('浏览器不支持音频输入');
    } else {
        navigator.getUserMedia({
                audio: true
            },
            function (mediaStream) {
                console.log('开始录音');
                initWs(mediaStream);
            },
            function (error) {
                console.log(error);
                switch (error.message || error.name) {
                    case 'PERMISSION_DENIED':
                    case 'PermissionDeniedError':
                        console.info('用户拒绝提供信息。');
                        break;
                    case 'NOT_SUPPORTED_ERROR':
                    case 'NotSupportedError':
                        console.info('浏览器不支持硬件设备。');
                        break;
                    case 'MANDATORY_UNSATISFIED_ERROR':
                    case 'MandatoryUnsatisfiedError':
                        console.info('无法发现指定的硬件设备。');
                        break;
                    default:
                        console.info('无法打开麦克风。异常信息:' + (error.code || error.name));
                        break;
                }
            }
        )
    }
}

let ws = null;
let audioContext = null; //音频上下文，用来创建音频源
let audioInput = null; //音频输入
let recorderAudioProcessor = null; //音频处理器，用来实现音频录制功能

/**
 * 初始化websocket连接，并开启音频处理
 * @param stream
 */
function initWs(stream) {
    ws = new WebSocket("ws://" + window.location.host + "/recorder");
    ws.binaryType = 'arraybuffer'; //传输的是 ArrayBuffer 类型的数据
    ws.onopen = function (event) {
        console.log('握手成功');
        constructAudioNodeGraph(stream)
    };

    ws.onclose = function (event) {
        console.log('断开连接');
    };

    ws.onmessage = function (msg) {
        console.info(msg)
    }

    ws.onerror = function (err) {
        console.info(err)
    }
}

/**
 * 构建音频处理器拓扑图
 * @param stream
 * @returns {Promise<void>}
 */
async function constructAudioNodeGraph(stream) {
    if (!audioContext) {
        try {
            audioContext = new AudioContext();
            audioInput = audioContext.createMediaStreamSource(stream);
            await audioContext.audioWorklet.addModule("recorder-audio-processor.js");
            recorderAudioProcessor = new AudioWorkletNode(audioContext, "recorder-audio-processor");
            recorderAudioProcessor.port.onmessage = (event) => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(event.data);
                } else {
                    console.log("ws has close, ignore data:" + event.data.length)
                }
            };
            audioInput.connect(recorderAudioProcessor).connect(audioContext.destination);

            await audioContext.resume();
        } catch (e) {
            console.log(`** Error: Unable to create worklet node: ${e}`);
        }
    }
}

/**
 * 停止音频处理
 * @returns {Promise<void>}
 */
async function stop() {
    recorderAudioProcessor.disconnect();
    audioInput.disconnect();
    await audioContext.close();
    audioContext = null;
    if (ws) {
        ws.close();
    }
}