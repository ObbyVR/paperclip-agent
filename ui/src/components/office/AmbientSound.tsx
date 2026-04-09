/**
 * AmbientSound — Synthesized office ambiance using Web Audio API.
 *
 * Generates soft keyboard typing sounds and low hum. Toggle on/off
 * via button. State persisted in localStorage.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const LS_KEY = "paperclip:office:ambient-sound";

export function AmbientSound() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(LS_KEY) === "on");
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const startAmbient = useCallback(() => {
    if (ctxRef.current) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;

    // Master gain (low volume)
    const master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);
    gainRef.current = master;

    // Low office hum (brown noise filtered)
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // boost
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 200;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.6;

    noiseSource.connect(lpf);
    lpf.connect(noiseGain);
    noiseGain.connect(master);
    noiseSource.start();

    // Keyboard typing sounds — random short ticks
    intervalRef.current = setInterval(() => {
      if (ctx.state !== "running") return;
      // Random chance per tick (simulate sporadic typing)
      if (Math.random() > 0.3) return;

      const osc = ctx.createOscillator();
      const tickGain = ctx.createGain();
      const freq = 800 + Math.random() * 2000;
      osc.frequency.value = freq;
      osc.type = "square";

      const now = ctx.currentTime;
      tickGain.gain.setValueAtTime(0.02 + Math.random() * 0.03, now);
      tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03 + Math.random() * 0.02);

      osc.connect(tickGain);
      tickGain.connect(master);
      osc.start(now);
      osc.stop(now + 0.05);
    }, 80);
  }, []);

  const stopAmbient = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
      gainRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      startAmbient();
    } else {
      stopAmbient();
    }
    return stopAmbient;
  }, [enabled, startAmbient, stopAmbient]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(LS_KEY, next ? "on" : "off");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="text-[10px] text-muted-foreground hover:text-white transition-colors px-1"
      title={enabled ? "Disattiva suoni ambientali" : "Attiva suoni ambientali"}
    >
      {enabled ? "🔊" : "🔇"}
    </button>
  );
}
