/* ============================================
   DIGIT VISION — Main Application Logic
   Canvas Drawing + In-Browser TF.js CNN Training
   Trains a strong CNN on MNIST for 99%+ accuracy
   ============================================ */

// ──── DOM Elements ────
const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clearBtn');
const predictBtn = document.getElementById('predictBtn');
const brushSlider = document.getElementById('brushSize');
const canvasHint = document.getElementById('canvasHint');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingStatus = document.getElementById('loadingStatus');
const progressBar = document.getElementById('progressBar');
const epochInfo = document.getElementById('epochInfo');
const predictedDigit = document.getElementById('predictedDigit');
const confidenceValue = document.getElementById('confidenceValue');

// ──── State ────
let isDrawing = false;
let hasDrawn = false;
let model = null;
let lastPoint = null;

// ──── Floating Digits Background ────
function createFloatingDigits() {
    const container = document.getElementById('bgParticles');
    const digitCount = 40;

    for (let i = 0; i < digitCount; i++) {
        const span = document.createElement('span');
        span.classList.add('floating-digit');
        span.textContent = Math.floor(Math.random() * 10);

        // Randomize size (16px to 72px)
        const fontSize = Math.random() * 56 + 16;
        span.style.fontSize = fontSize + 'px';

        // Random horizontal position
        span.style.left = Math.random() * 100 + '%';

        // Random opacity (smaller = more transparent)
        const opacity = fontSize > 48 ? (Math.random() * 0.06 + 0.04) : (Math.random() * 0.12 + 0.06);
        span.style.setProperty('--digit-opacity', opacity);

        // Random animation durations
        const floatDuration = Math.random() * 20 + 15; // 15-35s
        const swayDuration = Math.random() * 8 + 4;    // 4-12s
        span.style.animationDuration = floatDuration + 's, ' + swayDuration + 's';

        // Random delay to stagger
        const delay = Math.random() * 25;
        span.style.animationDelay = delay + 's, ' + (delay + Math.random() * 2) + 's';

        // Some digits get extra glow
        if (Math.random() > 0.75) {
            span.classList.add('glow');
        }

        container.appendChild(span);
    }
}
createFloatingDigits();

// ──── Mouse Parallax Effect (desktop only) ────
(function initParallax() {
    // Skip on mobile — causes performance issues
    if (window.innerWidth <= 600) return;

    const bgLayer = document.getElementById('bgParticles');
    let mouseX = 0, mouseY = 0;
    let currentX = 0, currentY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 20;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 20;
    });

    function animateParallax() {
        currentX += (mouseX - currentX) * 0.05;
        currentY += (mouseY - currentY) * 0.05;
        bgLayer.style.transform = 'translate(' + currentX + 'px, ' + currentY + 'px)';
        requestAnimationFrame(animateParallax);
    }
    animateParallax();
})();

// ──── Cursor / Touch Digit Trail ────
(function initCursorTrail() {
    let lastSpawn = 0;
    const throttleMs = 45;

    function spawnDigit(x, y, target) {
        const now = Date.now();
        if (now - lastSpawn < throttleMs) return;
        lastSpawn = now;

        // Don't spawn on canvas to avoid interfering with drawing
        if (target && target.id === 'drawCanvas') return;

        const digit = document.createElement('span');
        digit.classList.add('cursor-digit');
        digit.textContent = Math.floor(Math.random() * 10);
        digit.style.left = x + 'px';
        digit.style.top = y + 'px';

        // Random offset spread
        const offsetX = (Math.random() - 0.5) * 20;
        digit.style.setProperty('--offset-x', offsetX + 'px');

        document.body.appendChild(digit);

        // Remove after animation completes
        setTimeout(() => { digit.remove(); }, 1000);
    }

    // Mouse (laptop/desktop)
    document.addEventListener('mousemove', (e) => {
        spawnDigit(e.clientX, e.clientY, e.target);
    });

    // Touch (mobile/tablet)
    document.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        if (!touch) return;
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        spawnDigit(touch.clientX, touch.clientY, target);
    }, { passive: true });
})();

// ──── Scroll Reveal Animations ────
function initScrollAnimations() {
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => observer.observe(el));
}

// Init scroll animations after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollAnimations);
} else {
    initScrollAnimations();
}

// ──── Canvas Drawing ────
function initCanvas() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = parseInt(brushSlider.value);
    lastPoint = null;
}
initCanvas();

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
        return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function startDraw(e) {
    e.preventDefault();
    isDrawing = true;
    if (!hasDrawn) { hasDrawn = true; canvasHint.classList.add('hidden'); }
    const pos = getPos(e);
    lastPoint = pos;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    if (lastPoint) {
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }
    lastPoint = pos;
}

function stopDraw() { isDrawing = false; lastPoint = null; }

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDraw);
canvas.addEventListener('mouseleave', stopDraw);
canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDraw);
canvas.addEventListener('touchcancel', stopDraw);
brushSlider.addEventListener('input', () => { ctx.lineWidth = parseInt(brushSlider.value); });

clearBtn.addEventListener('click', () => {
    initCanvas();
    hasDrawn = false;
    canvasHint.classList.remove('hidden');
    predictedDigit.textContent = '?';
    predictedDigit.classList.remove('pop');
    confidenceValue.textContent = '\u2014';
    for (let i = 0; i < 10; i++) {
        document.getElementById('bar' + i).style.width = '0%';
        document.getElementById('val' + i).textContent = '0%';
        document.querySelector('.bar-item[data-digit="' + i + '"]').classList.remove('top');
    }
});

// ──── MNIST Data ────
const MNIST_IMAGES_URL = 'https://storage.googleapis.com/learnjs-data/model-builder/mnist_images.png';
const MNIST_LABELS_URL = 'https://storage.googleapis.com/learnjs-data/model-builder/mnist_labels_uint8';
const IMAGE_SIZE = 784;
const NUM_CLASSES = 10;
const NUM_DATASET = 65000;
const NUM_TRAIN = 55000;
const NUM_TEST = NUM_DATASET - NUM_TRAIN;

class MnistData {
    async load() {
        const imgPromise = new Promise((resolve) => {
            const img = new Image();
            const c = document.createElement('canvas');
            const cctx = c.getContext('2d');
            img.crossOrigin = '';
            img.onload = () => {
                const buf = new ArrayBuffer(NUM_DATASET * IMAGE_SIZE * 4);
                const chunkSize = 5000;
                c.width = img.width;
                c.height = chunkSize;
                for (let i = 0; i < NUM_DATASET / chunkSize; i++) {
                    const view = new Float32Array(buf, i * IMAGE_SIZE * chunkSize * 4, IMAGE_SIZE * chunkSize);
                    cctx.drawImage(img, 0, i * chunkSize, img.width, chunkSize, 0, 0, img.width, chunkSize);
                    const d = cctx.getImageData(0, 0, c.width, chunkSize);
                    for (let j = 0; j < d.data.length / 4; j++) view[j] = d.data[j * 4] / 255;
                }
                this.images = new Float32Array(buf);
                resolve();
            };
            img.src = MNIST_IMAGES_URL;
        });
        const labelsResponse = await fetch(MNIST_LABELS_URL);
        const [, labelsBuffer] = await Promise.all([imgPromise, labelsResponse.arrayBuffer()]);
        this.labels = new Uint8Array(labelsBuffer);
    }

    getTrainData() {
        return {
            xs: tf.tensor4d(this.images.slice(0, IMAGE_SIZE * NUM_TRAIN), [NUM_TRAIN, 28, 28, 1]),
            labels: tf.tensor2d(this.labels.slice(0, NUM_CLASSES * NUM_TRAIN), [NUM_TRAIN, NUM_CLASSES])
        };
    }

    getTestData(n) {
        return {
            xs: tf.tensor4d(this.images.slice(IMAGE_SIZE * NUM_TRAIN, IMAGE_SIZE * NUM_TRAIN + IMAGE_SIZE * n), [n, 28, 28, 1]),
            labels: tf.tensor2d(this.labels.slice(NUM_CLASSES * NUM_TRAIN, NUM_CLASSES * NUM_TRAIN + NUM_CLASSES * n), [n, NUM_CLASSES])
        };
    }
}

// ──── Build Pre-trained Model Architecture (matches Python train_model.py) ────
// This architecture includes BatchNormalization layers matching the pre-trained weights
function buildPretrainedModel() {
    const m = tf.sequential();
    // Block 1
    m.add(tf.layers.conv2d({ inputShape: [28, 28, 1], filters: 32, kernelSize: 3, padding: 'same', activation: 'relu', name: 'conv2d' }));
    m.add(tf.layers.batchNormalization({ name: 'batch_normalization' }));
    m.add(tf.layers.conv2d({ filters: 32, kernelSize: 3, padding: 'same', activation: 'relu', name: 'conv2d_1' }));
    m.add(tf.layers.batchNormalization({ name: 'batch_normalization_1' }));
    m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    m.add(tf.layers.dropout({ rate: 0.25 }));
    // Block 2
    m.add(tf.layers.conv2d({ filters: 64, kernelSize: 3, padding: 'same', activation: 'relu', name: 'conv2d_2' }));
    m.add(tf.layers.batchNormalization({ name: 'batch_normalization_2' }));
    m.add(tf.layers.conv2d({ filters: 64, kernelSize: 3, padding: 'same', activation: 'relu', name: 'conv2d_3' }));
    m.add(tf.layers.batchNormalization({ name: 'batch_normalization_3' }));
    m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    m.add(tf.layers.dropout({ rate: 0.25 }));
    // Block 3
    m.add(tf.layers.conv2d({ filters: 128, kernelSize: 3, padding: 'same', activation: 'relu', name: 'conv2d_4' }));
    m.add(tf.layers.batchNormalization({ name: 'batch_normalization_4' }));
    m.add(tf.layers.dropout({ rate: 0.4 }));
    // Classifier
    m.add(tf.layers.flatten());
    m.add(tf.layers.dense({ units: 256, activation: 'relu', name: 'dense' }));
    m.add(tf.layers.batchNormalization({ name: 'batch_normalization_5' }));
    m.add(tf.layers.dropout({ rate: 0.5 }));
    m.add(tf.layers.dense({ units: 10, activation: 'softmax', name: 'dense_1' }));

    m.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
    return m;
}

// ──── Build Simple Model (for in-browser training fallback) ────
function buildSimpleModel() {
    const m = tf.sequential();
    m.add(tf.layers.conv2d({ inputShape: [28, 28, 1], filters: 32, kernelSize: 3, padding: 'same', activation: 'relu' }));
    m.add(tf.layers.conv2d({ filters: 32, kernelSize: 3, padding: 'same', activation: 'relu' }));
    m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    m.add(tf.layers.dropout({ rate: 0.25 }));
    m.add(tf.layers.conv2d({ filters: 64, kernelSize: 3, padding: 'same', activation: 'relu' }));
    m.add(tf.layers.conv2d({ filters: 64, kernelSize: 3, padding: 'same', activation: 'relu' }));
    m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    m.add(tf.layers.dropout({ rate: 0.25 }));
    m.add(tf.layers.flatten());
    m.add(tf.layers.dense({ units: 256, activation: 'relu' }));
    m.add(tf.layers.dropout({ rate: 0.5 }));
    m.add(tf.layers.dense({ units: 10, activation: 'softmax' }));
    m.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
    return m;
}

async function trainModel(m, data) {
    const BATCH_SIZE = 256;
    const EPOCHS = 10;
    const train = data.getTrainData();
    const test = data.getTestData(2000);

    const totalBatches = Math.ceil(NUM_TRAIN / BATCH_SIZE) * EPOCHS;
    let batchesDone = 0;

    await m.fit(train.xs, train.labels, {
        batchSize: BATCH_SIZE,
        epochs: EPOCHS,
        validationData: [test.xs, test.labels],
        shuffle: true,
        callbacks: {
            onBatchEnd: () => {
                batchesDone++;
                progressBar.style.width = ((batchesDone / totalBatches) * 100) + '%';
            },
            onEpochBegin: (epoch) => {
                epochInfo.textContent = 'Epoch ' + (epoch + 1) + ' / ' + EPOCHS;
                loadingStatus.textContent = 'Training epoch ' + (epoch + 1) + '...';
            },
            onEpochEnd: (epoch, logs) => {
                const acc = (logs.val_acc * 100).toFixed(1);
                loadingStatus.textContent = 'Epoch ' + (epoch + 1) + ' done - Val accuracy: ' + acc + '%';
            }
        }
    });

    train.xs.dispose(); train.labels.dispose();
    test.xs.dispose(); test.labels.dispose();
}

// ──── Load pre-trained weights from .bin file into a JS-built model ────
async function loadPretrainedWeights(m) {
    const WEIGHTS_URL = 'tfjs_model/group1-shard1of1.bin';
    const response = await fetch(WEIGHTS_URL);
    if (!response.ok) throw new Error('Failed to fetch weights: ' + response.status);
    const buffer = await response.arrayBuffer();

    // Weight layout matches Python model layer order (same as weightsManifest)
    const weightSpecs = [
        { name: 'conv2d/kernel', shape: [3, 3, 1, 32] },
        { name: 'conv2d/bias', shape: [32] },
        { name: 'batch_normalization/gamma', shape: [32] },
        { name: 'batch_normalization/beta', shape: [32] },
        { name: 'batch_normalization/moving_mean', shape: [32] },
        { name: 'batch_normalization/moving_variance', shape: [32] },
        { name: 'conv2d_1/kernel', shape: [3, 3, 32, 32] },
        { name: 'conv2d_1/bias', shape: [32] },
        { name: 'batch_normalization_1/gamma', shape: [32] },
        { name: 'batch_normalization_1/beta', shape: [32] },
        { name: 'batch_normalization_1/moving_mean', shape: [32] },
        { name: 'batch_normalization_1/moving_variance', shape: [32] },
        { name: 'conv2d_2/kernel', shape: [3, 3, 32, 64] },
        { name: 'conv2d_2/bias', shape: [64] },
        { name: 'batch_normalization_2/gamma', shape: [64] },
        { name: 'batch_normalization_2/beta', shape: [64] },
        { name: 'batch_normalization_2/moving_mean', shape: [64] },
        { name: 'batch_normalization_2/moving_variance', shape: [64] },
        { name: 'conv2d_3/kernel', shape: [3, 3, 64, 64] },
        { name: 'conv2d_3/bias', shape: [64] },
        { name: 'batch_normalization_3/gamma', shape: [64] },
        { name: 'batch_normalization_3/beta', shape: [64] },
        { name: 'batch_normalization_3/moving_mean', shape: [64] },
        { name: 'batch_normalization_3/moving_variance', shape: [64] },
        { name: 'conv2d_4/kernel', shape: [3, 3, 64, 128] },
        { name: 'conv2d_4/bias', shape: [128] },
        { name: 'batch_normalization_4/gamma', shape: [128] },
        { name: 'batch_normalization_4/beta', shape: [128] },
        { name: 'batch_normalization_4/moving_mean', shape: [128] },
        { name: 'batch_normalization_4/moving_variance', shape: [128] },
        { name: 'dense/kernel', shape: [6272, 256] },
        { name: 'dense/bias', shape: [256] },
        { name: 'batch_normalization_5/gamma', shape: [256] },
        { name: 'batch_normalization_5/beta', shape: [256] },
        { name: 'batch_normalization_5/moving_mean', shape: [256] },
        { name: 'batch_normalization_5/moving_variance', shape: [256] },
        { name: 'dense_1/kernel', shape: [256, 10] },
        { name: 'dense_1/bias', shape: [10] }
    ];

    // Parse binary buffer into tensors
    let offset = 0;
    const namedTensors = {};
    for (const spec of weightSpecs) {
        const size = spec.shape.reduce((a, b) => a * b, 1);
        const values = new Float32Array(buffer, offset, size);
        namedTensors[spec.name] = tf.tensor(values, spec.shape);
        offset += size * 4; // float32 = 4 bytes
    }

    // Assign weights to model layers by matching names
    for (const layer of m.layers) {
        const layerWeights = layer.weights;
        if (layerWeights.length === 0) continue;

        const newWeights = [];
        for (const w of layerWeights) {
            // TF.js weight names are like "conv2d/kernel" or "batch_normalization/gamma"
            const wName = w.name.replace(':0', '');
            if (namedTensors[wName]) {
                newWeights.push(namedTensors[wName]);
            } else {
                throw new Error('Missing weight: ' + wName);
            }
        }
        layer.setWeights(newWeights);
    }

    console.log('Pre-trained weights loaded successfully!');
}

// ──── Preprocessing ────
function preprocessCanvas() {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;

    let minX = width, minY = height, maxX = 0, maxY = 0;
    let hasContent = false;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if ((data[idx] + data[idx + 1] + data[idx + 2]) / 3 > 20) {
                hasContent = true;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (!hasContent) return null;

    const dw = maxX - minX + 1, dh = maxY - minY + 1;
    const maxDim = Math.max(dw, dh);
    const pad = Math.floor(maxDim * 0.3);
    const total = maxDim + pad * 2;

    const sq = document.createElement('canvas');
    sq.width = total; sq.height = total;
    const sqCtx = sq.getContext('2d');
    sqCtx.fillStyle = '#000';
    sqCtx.fillRect(0, 0, total, total);
    sqCtx.drawImage(canvas, minX, minY, dw, dh, pad + (maxDim - dw) / 2, pad + (maxDim - dh) / 2, dw, dh);

    const tmp = document.createElement('canvas');
    tmp.width = 28; tmp.height = 28;
    const tmpCtx = tmp.getContext('2d');
    tmpCtx.fillStyle = '#000';
    tmpCtx.fillRect(0, 0, 28, 28);
    tmpCtx.drawImage(sq, 0, 0, total, total, 0, 0, 28, 28);

    const img = tmpCtx.getImageData(0, 0, 28, 28);
    const gs = new Float32Array(784);
    for (let i = 0; i < img.data.length; i += 4) {
        gs[i / 4] = (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]) / 255;
    }
    return tf.tensor4d(gs, [1, 28, 28, 1]);
}

// ──── Display Prediction ────
function displayPrediction(predictions) {
    const probs = predictions.dataSync();
    let maxIdx = 0, maxVal = 0;
    for (let i = 0; i < probs.length; i++) {
        if (probs[i] > maxVal) { maxVal = probs[i]; maxIdx = i; }
    }

    predictedDigit.textContent = maxIdx;
    predictedDigit.classList.remove('pop');
    void predictedDigit.offsetWidth;
    predictedDigit.classList.add('pop');
    confidenceValue.textContent = (maxVal * 100).toFixed(1) + '%';

    for (let i = 0; i < 10; i++) {
        const pct = (probs[i] * 100).toFixed(1);
        setTimeout(() => {
            document.getElementById('bar' + i).style.width = pct + '%';
            document.getElementById('val' + i).textContent = pct + '%';
        }, i * 30);
        const item = document.querySelector('.bar-item[data-digit="' + i + '"]');
        i === maxIdx ? item.classList.add('top') : item.classList.remove('top');
    }
    predictions.dispose();
}

predictBtn.addEventListener('click', () => {
    if (!model || !hasDrawn) return;
    const t = preprocessCanvas();
    if (!t) return;
    displayPrediction(model.predict(t));
    t.dispose();
});

// ──── Init with Model Persistence ────
const MODEL_DB_KEY = 'indexeddb://digit-vision-model';

async function init() {
    try {
        loadingStatus.textContent = 'Loading pre-trained model...';
        progressBar.style.width = '20%';

        // Strategy 1: Load from IndexedDB (cached from previous visit)
        try {
            model = await tf.loadLayersModel(MODEL_DB_KEY);
            console.log('✅ Loaded model from IndexedDB cache!');
            progressBar.style.width = '100%';
            loadingStatus.textContent = 'Model loaded instantly!';
            epochInfo.textContent = 'Cached model ready';

            const warmup = tf.zeros([1, 28, 28, 1]);
            model.predict(warmup).dispose();
            warmup.dispose();

            setTimeout(() => { loadingOverlay.classList.add('hidden'); }, 400);
            return;
        } catch (e) {
            console.log('No IndexedDB cache:', e.message);
        }

        // Strategy 2: Build model in JS + load pre-trained weights from .bin file
        // This bypasses model.json topology parsing entirely!
        try {
            progressBar.style.width = '30%';
            loadingStatus.textContent = 'Loading pre-trained model...';

            model = buildPretrainedModel();
            progressBar.style.width = '50%';
            loadingStatus.textContent = 'Downloading pre-trained weights (~7 MB)...';

            await loadPretrainedWeights(model);
            console.log('✅ Pre-trained model loaded with weights!');

            progressBar.style.width = '80%';

            // Save to IndexedDB for instant load next time
            loadingStatus.textContent = 'Caching model for faster loads...';
            try {
                await model.save(MODEL_DB_KEY);
                console.log('✅ Model cached to IndexedDB!');
            } catch (saveErr) {
                console.log('Could not cache model:', saveErr);
            }

            progressBar.style.width = '100%';
            loadingStatus.textContent = 'Model ready! 99%+ accuracy';
            epochInfo.textContent = 'Pre-trained model loaded';

            const warmup = tf.zeros([1, 28, 28, 1]);
            model.predict(warmup).dispose();
            warmup.dispose();

            setTimeout(() => { loadingOverlay.classList.add('hidden'); }, 500);
            return;
        } catch (e) {
            console.error('❌ Could not load pre-trained weights:', e);
        }

        // Strategy 3: Train from scratch (absolute last resort)
        console.warn('⚠️ Falling back to in-browser training...');
        loadingStatus.textContent = 'Downloading MNIST dataset (~15 MB)...';
        const data = new MnistData();
        await data.load();
        progressBar.style.width = '5%';

        loadingStatus.textContent = 'Building CNN model...';
        model = buildSimpleModel();

        await trainModel(model, data);

        progressBar.style.width = '95%';

        loadingStatus.textContent = 'Saving model for future visits...';
        await model.save(MODEL_DB_KEY);
        console.log('Model saved to IndexedDB!');

        progressBar.style.width = '100%';
        const test = data.getTestData(5000);
        const evalResult = model.evaluate(test.xs, test.labels);
        const acc = (await evalResult[1].data())[0];
        loadingStatus.textContent = 'Ready! Test accuracy: ' + (acc * 100).toFixed(1) + '%';
        epochInfo.textContent = (acc * 100).toFixed(1) + '% accuracy';
        console.log('Test accuracy:', (acc * 100).toFixed(1) + '%');
        test.xs.dispose(); test.labels.dispose();
        evalResult[0].dispose(); evalResult[1].dispose();

        setTimeout(() => { loadingOverlay.classList.add('hidden'); }, 800);
    } catch (err) {
        console.error('Init error:', err);
        loadingStatus.textContent = 'Error: ' + err.message;
    }
}

init();
