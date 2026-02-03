import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { WebView } from "react-native-webview";
import { VideoView, useVideoPlayer } from "expo-video";
import type { StyleProp, ViewStyle } from "react-native";

import {
    HARD_RELOAD_INTERVAL_MS,
    RETRY_DELAY_MS,
    SIGNAGE_URL,
} from "./src/config";

/** ====== CONFIG ที่ต้องตั้ง ====== */
const DEVICE_ID = "DEVICE_001";
const SIGNAGE_API_BASE = "https://signage-config-api.onrender.com";
const CONFIG_POLL_MS = 5000;

const FALLBACK_VIDEO_URL =
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
/** =============================== */

type UiState = "loading" | "ready" | "error";
type LayoutMode = "split" | "web_only" | "video_only";

type ScreenOrientation = "row" | "column";

type ScreenConfig = {
    // row = วางซ้าย-ขวา, column = วางบน-ล่าง
    orientation?: ScreenOrientation;

    // splitRatio = สัดส่วนของ VIDEO (%)
    // เช่น 40 = video 40% / web 60%
    splitRatio?: number; // 0..100

    // ช่องว่างระหว่าง video กับ web (px)
    gapPx?: number;

    // padding รอบๆ ทั้งหน้าจอ (px)
    paddingPx?: number;
};

type RemoteConfig = {
    deviceId: string;
    exists?: boolean;
    webUrl?: string;
    videoUrl?: string;
    layout?: LayoutMode;
    updatedAt?: number;

    // ✅ เพิ่มเติม: config หน้าจอ
    screen?: ScreenConfig;
};

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export default function App() {
    const webRef = useRef<WebView>(null);

    const [uiState, setUiState] = useState<UiState>("loading");
    const [reloadKey, setReloadKey] = useState(0);
    const [lastError, setLastError] = useState<string | null>(null);

    // ✅ config state (มาจาก backend/db)
    const [webUrl, setWebUrl] = useState<string>(SIGNAGE_URL);
    const [videoUrl, setVideoUrl] = useState<string>(FALLBACK_VIDEO_URL);
    const [layout, setLayout] = useState<LayoutMode>("split");

    // ✅ screen state (มาจาก backend/db)
    const [orientation, setOrientation] = useState<ScreenOrientation>("row");
    const [splitRatio, setSplitRatio] = useState<number>(50); // video%
    const [gapPx, setGapPx] = useState<number>(0);
    const [paddingPx, setPaddingPx] = useState<number>(0);

    const player = useVideoPlayer(videoUrl, (p) => {
        p.loop = true;
        p.muted = true;
        p.play();
    });

    const configUrl = useMemo(() => {
        return `${SIGNAGE_API_BASE}/signage/config?deviceId=${encodeURIComponent(
            DEVICE_ID
        )}`;
    }, []);

    // ====== 1) Poll config ======
    useEffect(() => {
        let alive = true;

        async function fetchConfig() {
            try {
                const res = await fetch(configUrl, {
                    headers: { "Cache-Control": "no-cache" },
                });
                if (!res.ok) throw new Error(`CONFIG_HTTP_${res.status}`);

                const cfg = (await res.json()) as RemoteConfig;
                if (!alive) return;

                // ---- layout (show/hide) ----
                const nextLayout: LayoutMode =
                    cfg.layout === "web_only" || cfg.layout === "video_only"
                        ? cfg.layout
                        : "split";
                setLayout(nextLayout);

                // ---- urls ----
                const nextWeb = (cfg.webUrl || "").trim();
                const nextVideo = (cfg.videoUrl || "").trim();

                if (nextVideo && nextVideo !== videoUrl) setVideoUrl(nextVideo);
                if (nextWeb && nextWeb !== webUrl) {
                    setWebUrl(nextWeb);
                    setReloadKey((k) => k + 1);
                }

                // ---- screen config ----
                const sc = cfg.screen || {};

                if (sc.orientation === "row" || sc.orientation === "column") {
                    setOrientation(sc.orientation);
                }

                if (typeof sc.splitRatio === "number" && Number.isFinite(sc.splitRatio)) {
                    setSplitRatio(clamp(sc.splitRatio, 0, 100));
                }

                if (typeof sc.gapPx === "number" && Number.isFinite(sc.gapPx)) {
                    setGapPx(clamp(sc.gapPx, 0, 200));
                }

                if (typeof sc.paddingPx === "number" && Number.isFinite(sc.paddingPx)) {
                    setPaddingPx(clamp(sc.paddingPx, 0, 200));
                }
            } catch (e: any) {
                console.log("FETCH_CONFIG_FAIL", e?.message ?? String(e));
            }
        }

        void fetchConfig();
        const t = setInterval(fetchConfig, CONFIG_POLL_MS);

        return () => {
            alive = false;
            clearInterval(t);
        };
    }, [configUrl, webUrl, videoUrl]);

    // ====== 2) hard reload webview กันค้าง ======
    useEffect(() => {
        const t = setInterval(() => {
            if (layout !== "video_only") setReloadKey((k) => k + 1);
        }, HARD_RELOAD_INTERVAL_MS);
        return () => clearInterval(t);
    }, [layout]);

    // ====== 3) retry webview เมื่อ error ======
    useEffect(() => {
        if (uiState !== "error") return;
        const t = setTimeout(() => {
            setReloadKey((k) => k + 1);
            setUiState("loading");
            setLastError(null);
        }, RETRY_DELAY_MS);
        return () => clearTimeout(t);
    }, [uiState]);

    const showVideo = layout !== "web_only";
    const showWeb = layout !== "video_only";

    // ✅ คำนวณ flex ตาม splitRatio (video%)
    const videoFlex = clamp(splitRatio, 0, 100);
    const webFlex = 100 - videoFlex;

    // ถ้าซ่อนฝั่งหนึ่ง ให้กินเต็ม
    const leftFlex = showVideo ? Math.max(0, videoFlex) : 0;
    const rightFlex = showWeb ? Math.max(0, webFlex) : 0;

    const containerStyle: StyleProp<ViewStyle> = [
        styles.container,
        { flexDirection: orientation, padding: paddingPx, rowGap: gapPx, columnGap: gapPx },
    ];


    return (
        <View style={styles.root}>
            <View style={containerStyle}>
                {/* VIDEO */}
                <View
                    style={[
                        styles.panel,
                        leftFlex === 0 ? styles.hidden : { flex: leftFlex },
                    ]}
                >
                    {showVideo && (
                        <VideoView
                            key={videoUrl}
                            style={styles.video}
                            player={player}
                            allowsFullscreen={false}
                            allowsPictureInPicture={false}
                        />
                    )}
                </View>

                {/* WEB */}
                <View
                    style={[
                        styles.panel,
                        rightFlex === 0 ? styles.hidden : { flex: rightFlex },
                    ]}
                >
                    {showWeb && (
                        <WebView
                            key={reloadKey}
                            ref={webRef}
                            source={{ uri: webUrl }}
                            style={styles.web}
                            javaScriptEnabled
                            domStorageEnabled
                            mixedContentMode="always"
                            onLoadStart={() => {
                                setUiState("loading");
                                setLastError(null);
                            }}
                            onLoadEnd={() => {
                                setUiState((s) => (s === "error" ? "error" : "ready"));
                            }}
                            onError={(e) => {
                                setUiState("error");
                                setLastError(e.nativeEvent?.description ?? "WEBVIEW_ERROR");
                            }}
                            onHttpError={(e) => {
                                setUiState("error");
                                setLastError(`HTTP_${e.nativeEvent.statusCode}`);
                            }}
                        />
                    )}

                    {showWeb && (uiState === "loading" || uiState === "error") && (
                        <View style={styles.overlay}>
                            <Text style={styles.overlayTitle}>
                                {uiState === "loading" ? "Loading..." : "Connection error"}
                            </Text>

                            {lastError && <Text style={styles.overlaySub}>{lastError}</Text>}

                            <Pressable
                                onPress={() => {
                                    setReloadKey((k) => k + 1);
                                    setUiState("loading");
                                    setLastError(null);
                                }}
                                style={styles.btn}
                            >
                                <Text style={styles.btnText}>Reload</Text>
                            </Pressable>

                            <Text style={styles.debug}>
                                {DEVICE_ID} • {layout} • {orientation} • {splitRatio}%
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#000" },

    container: {
        flex: 1,
        backgroundColor: "#000",
    },

    panel: {
        backgroundColor: "#000",
        minWidth: 0, // กัน webview overflow บน android บางรุ่น
        minHeight: 0,
    },

    hidden: { width: 0, height: 0, flex: 0 },

    video: { width: "100%", height: "100%" },
    web: { flex: 1, backgroundColor: "#000" },

    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
    },
    overlayTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
    overlaySub: { color: "#ccc", fontSize: 12 },

    btn: {
        marginTop: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: "#fff",
    },
    btnText: { color: "#111", fontWeight: "700" },

    debug: { marginTop: 10, color: "#999", fontSize: 11 },
});
