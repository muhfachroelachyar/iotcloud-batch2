// MQTT Configuration
const brokerUrl = 'wss://broker.emqx.io:8084mqtt';
const topicSuhu = "tes/1892121/topic/suhu";
const topicLampu = "tes/1892121/topic/lampu";
const topicKelembapan = "tes/1892121/topic/kelembapan";

// Simpan fungsi asli dari HTML (untuk lampu dan suhu)
const originalPublishLed = window.publish_led;
const originalUpdateSuhu = window.updateSuhu;

// State untuk mencegah flicker pada lampu
let currentLampState = '0'; // '0' = OFF, '1' = ON

// ========== PERBAIKAN FUNGSI UPDATE KELEMBAPAN ==========
// Memastikan jarum bergerak dari kiri (0%) ke kanan (100%) melalui busur bawah
window.updateKelembapan = function(val) {
    var el     = document.getElementById('kelembapan');
    var arc    = document.getElementById('humidArc');
    var needle = document.getElementById('humidNeedle');
    var bar    = document.getElementById('humidBar');
    var pill   = document.getElementById('humid-pill');
    var num    = parseFloat(val);
    if (isNaN(num)) { 
        el.textContent = val; 
        return; 
    }

    el.textContent = num + '%';
    var pct = Math.min(100, Math.max(0, num));
    
    // Update arc stroke-dashoffset (lingkaran gauge)
    arc.setAttribute('stroke-dashoffset', (166 - (pct / 100) * 166).toFixed(1));
    
    // Update horizontal bar di bawah
    bar.style.width = pct + '%';
    
    // Perbaikan arah jarum: 180° (kiri, 0%) → 0° (kanan, 100%) melalui bawah
    var angle = 180 - (pct / 65) * 180;   // derajat
    var rad = angle * Math.PI / 180;
    var cx = 65, cy = 65;      // titik pusat
    var r = 42;                // panjang jarum
    var x2 = cx + r * Math.cos(rad);
    var y2 = cy + r * Math.sin(rad);
    needle.setAttribute('x2', x2.toFixed(1));
    needle.setAttribute('y2', y2.toFixed(1));
    
    // Update status pill
    pill.className = 'iot-pill';
    if (num > 80) { 
        pill.textContent = 'Tinggi'; 
        pill.classList.add('pill-warning'); 
    } else { 
        pill.textContent = 'Normal'; 
        pill.classList.add('pill-normal'); 
    }
};

// ========== FUNGSI UPDATE LAMPU YANG TIDAK FLICKER ==========
function updateLampUI(state) {
    // Hanya update jika state berbeda dengan yang tersimpan
    if (state === currentLampState) return;
    
    currentLampState = state;
    // Panggil fungsi asli dari HTML untuk mengubah tampilan
    if (originalPublishLed) {
        originalPublishLed(state);
    }
}

// ========== MQTT CLIENT ==========
let client = null;

function connectMqtt() {
    client = mqtt.connect(brokerUrl, {
        clientId: "web_dashboard_" + Math.random().toString(16).substr(2, 8),
        clean: true,
        connectTimeout: 5000,
        keepalive: 30
    });

    client.on('connect', () => {
        console.log('✅ MQTT terhubung ke', brokerUrl);
        client.subscribe([topicSuhu, topicKelembapan, topicLampu], { qos: 1 }, (err) => {
            if (err) console.error('Gagal subscribe:', err);
            else console.log('Subscribe berhasil');
        });
    });

    client.on('message', (topic, message) => {
        const payload = message.toString();
        console.log(`📨 ${topic} -> ${payload}`);
        
        if (topic === topicSuhu) {
            if (window.updateSuhu) window.updateSuhu(payload);
        } 
        else if (topic === topicKelembapan) {
            if (window.updateKelembapan) window.updateKelembapan(payload);
        } 
        else if (topic === topicLampu) {
            // Normalisasi nilai lampu (1/0 atau ON/OFF)
            let newState = payload.trim().toUpperCase();
            if (newState === 'ON' || newState === '1') newState = '1';
            else newState = '0';
            
            // Update UI hanya jika state berbeda (mencegah flicker)
            updateLampUI(newState);
        }
    });

    client.on('error', (err) => console.error('❌ MQTT error:', err));
    client.on('reconnect', () => console.log('🔄 Mencoba reconnect...'));
    client.on('close', () => console.warn('⚠️ Koneksi MQTT ditutup'));
}

// ========== OVERRIDE FUNGSI PUBLISH_LED ==========
// Agar tombol ON/OFF dapat mengirim perintah via MQTT dan update UI tanpa flicker
window.publish_led = function(val) {
    // Normalisasi nilai
    let newState = (val === '1' || val === 'ON') ? '1' : '0';
    
    // Update UI terlebih dahulu (agar responsif)
    updateLampUI(newState);
    
    // Kirim perintah ke broker MQTT jika terhubung
    if (client && client.connected) {
        client.publish(topicLampu, newState, { qos: 1, retain: false });
        console.log(`💡 Perintah lampu dikirim: ${newState}`);
    } else {
        console.warn('MQTT belum terhubung, perintah lampu hanya lokal');
    }
};

// Jalankan koneksi MQTT
connectMqtt();
