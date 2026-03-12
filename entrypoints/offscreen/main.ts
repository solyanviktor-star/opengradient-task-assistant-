// Offscreen document: plays reminder sounds
// This runs in a hidden page context where AudioContext works without user gesture.

function playSound() {
  const ctx = new AudioContext();
  [0, 0.3, 0.6].forEach((delay, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = i % 2 === 0 ? 880 : 1100;
    gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + 0.25);
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PLAY_REMINDER_SOUND") {
    console.log("[offscreen] Playing reminder sound");
    playSound();
    setTimeout(playSound, 1500);
    setTimeout(playSound, 3000);
  }
});

console.log("[offscreen] Sound player ready");
