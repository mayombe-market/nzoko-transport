"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface ValidationResult {
  success: boolean;
  message: string;
  booking?: {
    reference: string;
    passengerName: string;
    seat: string;
    from: string;
    to: string;
    date: string;
    departureTime: string;
    scanCount: number;
  };
}

export default function ScannerPage() {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scannerReady, setScannerReady] = useState(false);
  const scannerRef = useRef<any>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  // Démarrer/arrêter la caméra avec html5-qrcode
  useEffect(() => {
    if (mode === "camera") {
      startScanner();
    } else {
      stopScanner();
    }
    return () => stopScanner();
  }, [mode]);

  async function startScanner() {
    setCameraError("");
    setScannerReady(false);

    try {
      // Import dynamique de html5-qrcode (côté client uniquement)
      const { Html5Qrcode } = await import("html5-qrcode");

      // Attendre que le DOM soit prêt
      await new Promise((r) => setTimeout(r, 100));

      if (!scannerContainerRef.current) return;

      const scanner = new Html5Qrcode("qr-scanner-container");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" }, // Caméra arrière
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        // Succès : QR décodé
        (decodedText: string) => {
          // Vibrer pour feedback (si supporté)
          if (navigator.vibrate) navigator.vibrate(200);
          // Valider le billet
          validateTicket(decodedText);
          // Pause le scanner après un scan réussi
          scanner.pause(true);
          // Reprendre après 3 secondes
          setTimeout(() => {
            try { scanner.resume(); } catch (e) {}
          }, 3000);
        },
        // Erreur de décodage (normal, continue de scanner)
        () => {}
      );

      setScannerReady(true);
    } catch (err: any) {
      console.error("Scanner error:", err);
      if (err?.message?.includes("Permission")) {
        setCameraError("Accès à la caméra refusé. Autorisez l'accès dans les paramètres de votre navigateur.");
      } else if (err?.message?.includes("NotFound") || err?.message?.includes("Requested device not found")) {
        setCameraError("Aucune caméra détectée sur cet appareil.");
      } else {
        setCameraError("Impossible de démarrer la caméra. Utilisez le mode manuel.");
      }
      setMode("manual");
    }
  }

  function stopScanner() {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop().catch(() => {});
      } catch (e) {}
      scannerRef.current = null;
    }
    setScannerReady(false);
  }

  async function validateTicket(reference: string) {
    if (!reference.trim()) {
      setResult({ success: false, message: "Veuillez entrer une référence." });
      return;
    }

    setScanning(true);
    setResult(null);

    try {
      const response = await fetch("/api/validate-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reference.trim().toUpperCase() }),
      });

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        message: "Erreur de connexion. Vérifiez votre réseau.",
      });
    }

    setScanning(false);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    validateTicket(manualCode);
  }

  function resetResult() {
    setResult(null);
    setManualCode("");
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <Link href="/admin" className="text-night hover:text-accent-700 text-sm mb-4 inline-flex items-center gap-1">
        ← Retour au dashboard
      </Link>

      <h1 className="section-title mt-2 mb-2">Scanner de billets</h1>
      <p className="text-gray-600 mb-6">
        Scannez le QR code du passager ou entrez la référence manuellement.
      </p>

      {/* Onglets Camera / Manuel */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode("camera")}
          className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
            mode === "camera"
              ? "bg-night text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          📷 Caméra
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
            mode === "manual"
              ? "bg-night text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          ⌨️ Manuel
        </button>
      </div>

      {/* Mode Caméra */}
      {mode === "camera" && (
        <div className="card mb-6">
          {cameraError ? (
            <div className="text-center py-8 text-red-600 text-sm">
              <div className="text-4xl mb-3">📷</div>
              <p>{cameraError}</p>
              <button
                onClick={() => setMode("manual")}
                className="btn-outline mt-4 text-sm"
              >
                Utiliser le mode manuel
              </button>
            </div>
          ) : (
            <div>
              {/* Container pour html5-qrcode */}
              <div
                id="qr-scanner-container"
                ref={scannerContainerRef}
                className="w-full rounded-lg overflow-hidden"
              />
              {!scannerReady && (
                <div className="text-center py-8 text-gray-400">
                  <div className="animate-pulse">Démarrage de la caméra...</div>
                </div>
              )}
              {scannerReady && (
                <p className="text-center text-xs text-gray-500 mt-3">
                  Placez le QR code devant la caméra — la validation est automatique
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mode Manuel */}
      {mode === "manual" && (
        <div className="card mb-6">
          <h3 className="font-bold text-night mb-3">Entrez la référence du billet</h3>
          <form onSubmit={handleManualSubmit} className="flex gap-3">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="input-field flex-1 font-mono uppercase tracking-wider"
              placeholder="NZK-260624-A3F2"
              required
            />
            <button
              type="submit"
              disabled={scanning}
              className="btn-primary whitespace-nowrap disabled:opacity-50"
            >
              {scanning ? "..." : "Valider"}
            </button>
          </form>
        </div>
      )}

      {/* Résultat */}
      {result && (
        <div className={`card border-2 ${result.success ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"}`}>
          <div className="text-center">
            <div className="text-5xl mb-3">
              {result.success ? "✅" : "❌"}
            </div>
            <h2 className={`text-xl font-bold mb-2 ${result.success ? "text-green-800" : "text-red-800"}`}>
              {result.success ? "VALIDE" : "INVALIDE"}
            </h2>
            <p className={`text-sm ${result.success ? "text-green-700" : "text-red-700"}`}>
              {result.message}
            </p>
          </div>

          {result.success && result.booking && (
            <div className="mt-4 pt-4 border-t border-green-200 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Passager</span>
                <span className="font-semibold">{result.booking.passengerName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Place</span>
                <span className="font-semibold">{result.booking.seat}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Trajet</span>
                <span className="font-semibold">{result.booking.from} → {result.booking.to}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Date</span>
                <span className="font-semibold">{result.booking.date}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Départ</span>
                <span className="font-semibold">{result.booking.departureTime}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Scan</span>
                <span className="font-semibold">{result.booking.scanCount}/3</span>
              </div>
            </div>
          )}

          <button
            onClick={resetResult}
            className="btn-outline w-full mt-4 text-sm"
          >
            Scanner un autre billet
          </button>
        </div>
      )}
    </div>
  );
}
