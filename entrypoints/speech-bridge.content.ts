/**
 * Audio recording bridge — runs in the PAGE'S MAIN WORLD.
 * Uses MediaRecorder (not SpeechRecognition) for reliable audio capture.
 * Sends recorded audio as base64 data URL to the isolated-world content script
 * via custom DOM events. Background then transcribes via Whisper API.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    let mediaRecorder: MediaRecorder | null = null;
    let audioChunks: Blob[] = [];
    let stream: MediaStream | null = null;

    document.addEventListener("__og_start", (async () => {
      try {
        // Request microphone
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];

        // Use webm/opus (small, widely supported)
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";

        mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          // Release microphone
          if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
          }

          const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
          console.log("[speech-bridge] Audio recorded:", blob.size, "bytes,", mediaRecorder?.mimeType);

          if (blob.size < 1000) {
            console.log("[speech-bridge] Audio too short, skipping");
            document.dispatchEvent(new CustomEvent("__og_error", { detail: "Recording too short" }));
            return;
          }

          // Convert to base64 data URL
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            document.dispatchEvent(new CustomEvent("__og_audio", { detail: dataUrl }));
          };
          reader.readAsDataURL(blob);
        };

        mediaRecorder.start(500); // Collect chunks every 500ms
        console.log("[speech-bridge] MediaRecorder started,", mediaRecorder.mimeType);
        document.dispatchEvent(new CustomEvent("__og_started"));
      } catch (err) {
        console.error("[speech-bridge] Start failed:", err);
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
          stream = null;
        }
        document.dispatchEvent(new CustomEvent("__og_error", { detail: String(err) }));
      }
    }) as EventListener);

    document.addEventListener("__og_stop", () => {
      console.log("[speech-bridge] Stopping MediaRecorder");
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      } else {
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
          stream = null;
        }
        document.dispatchEvent(new CustomEvent("__og_error", { detail: "Recorder not active" }));
      }
    });

    console.log("[speech-bridge] Main world bridge ready (MediaRecorder)");
  },
});
