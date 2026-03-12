// Content script: checks storage for due reminders, shows overlay + plays sound

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    function playSound() {
      try {
        const ctx = new AudioContext();
        ctx.resume();
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
      } catch (_) {}
    }

    function showReminder(taskAction: string, taskId: string) {
      // Remove any existing reminder overlay first
      const existing = document.getElementById("og-reminder");
      if (existing) existing.remove();

      const el = document.createElement("div");
      el.id = "og-reminder";
      el.setAttribute("style", [
        "position:fixed",
        "top:0",
        "left:0",
        "right:0",
        "z-index:2147483647",
        "background:linear-gradient(135deg,#4f46e5,#7c3aed)",
        "color:#fff",
        "padding:20px 24px",
        "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        "font-size:18px",
        "font-weight:600",
        "box-shadow:0 4px 24px rgba(0,0,0,0.5)",
        "cursor:pointer",
        "display:flex",
        "align-items:center",
        "gap:16px",
        "line-height:1.4",
      ].join("!important;") + "!important;");

      const safeText = taskAction.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      el.innerHTML = `<span style="font-size:32px!important">⏰</span><span style="flex:1!important">${safeText}</span><span style="background:rgba(255,255,255,0.25)!important;padding:8px 16px!important;border-radius:8px!important;font-size:14px!important;white-space:nowrap!important">Open ➜</span>`;

      el.onclick = () => {
        el.remove();
        chrome.runtime.sendMessage({ type: "OPEN_POPUP", taskId }).catch(() => {});
      };

      (document.documentElement || document.body).appendChild(el);

      playSound();
      setTimeout(playSound, 2000);
      setTimeout(playSound, 4000);

      setTimeout(() => { try { el.remove(); } catch (_) {} }, 30000);
    }

    async function check() {
      try {
        const data = await chrome.storage.local.get(["tasks"]);
        const tasks = data.tasks || [];
        const now = Date.now();
        for (const task of tasks) {
          if (!task.reminderAt) continue;
          if (new Date(task.reminderAt).getTime() <= now) {
            showReminder(task.action, task.id);
            const updated = tasks.map((t: any) =>
              t.id === task.id ? { ...t, reminderAt: null } : t
            );
            await chrome.storage.local.set({ tasks: updated });
            break;
          }
        }
      } catch (_) {}
    }

    check();
    setInterval(check, 10000);
  },
});
