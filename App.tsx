import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    useWindowDimensions,
    Pressable,
} from "react-native";
import { WebView } from "react-native-webview";
import { VideoView, useVideoPlayer } from "expo-video";

import {
    SIGNAGE_URL,
    HARD_RELOAD_INTERVAL_MS,
    RETRY_DELAY_MS,
} from "./ src/config";

type UiState = "loading" | "ready" | "error";

// 🔴 เปลี่ยนเป็นไฟล์วิดีโอของคุณ
const VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

export default function App() {
    const webRef = useRef<WebView>(null);
    const { width, height } = useWindowDimensions();

    const [uiState, setUiState] = useState<UiState>("loading");
    const [reloadKey, setReloadKey] = useState(0);
    const [lastError, setLastError] = useState<string | null>(null);

    // Expo Video Player
    const player = useVideoPlayer(VIDEO_URL, (p) => {
        p.loop = true;
        p.muted = true;
        p.play();
    });

    // reload webview กันค้าง
    useEffect(() => {
        const t = setInterval(() => {
            setReloadKey((k) => k + 1);
        }, HARD_RELOAD_INTERVAL_MS);
        return () => clearInterval(t);
    }, []);

    // retry webview เมื่อ error
    useEffect(() => {
        if (uiState !== "error") return;

        const t = setTimeout(() => {
            setReloadKey((k) => k + 1);
            setUiState("loading");
            setLastError(null);
        }, RETRY_DELAY_MS);

        return () => clearTimeout(t);
    }, [uiState]);

    const url = useMemo(() => SIGNAGE_URL, []);

    return (
        <View style={styles.root}>
            <View style={styles.row}>
                {/* LEFT : VIDEO */}
                <View style={styles.left}>
                    <VideoView
                        style={styles.video}
                        player={player}
                        allowsFullscreen={false}
                        allowsPictureInPicture={false}
                    />
                </View>

                {/* RIGHT : WEBVIEW */}
                <View style={styles.right}>
                    <WebView
                        key={reloadKey}
                        ref={webRef}
                        source={{ uri: url }}
                        style={styles.web}
                        javaScriptEnabled
                        domStorageEnabled
                        mixedContentMode="always"
                        onLoadStart={() => {
                            setUiState("loading");
                            setLastError(null);
                        }}
                        onLoadEnd={() => setUiState("ready")}
                        onError={(e) => {
                            setUiState("error");
                            setLastError(e.nativeEvent?.description ?? "WEBVIEW_ERROR");
                        }}
                        onHttpError={(e) => {
                            setUiState("error");
                            setLastError(`HTTP_${e.nativeEvent.statusCode}`);
                        }}
                    />

                    {(uiState === "loading" || uiState === "error") && (
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
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: "#000",
    },

    row: {
        flex: 1,
        flexDirection: "row",
    },

    // ซ้าย 50%
    left: {
        flex: 1,
        backgroundColor: "#000",
    },

    // ขวา 50%
    right: {
        flex: 1,
        backgroundColor: "#000",
    },

    video: {
        width: "100%",
        height: "100%",
    },

    web: {
        flex: 1,
        backgroundColor: "#000",
    },

    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
    },

    overlayTitle: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
    },

    overlaySub: {
        color: "#ccc",
        fontSize: 12,
    },

    btn: {
        marginTop: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: "#fff",
    },

    btnText: {
        color: "#111",
        fontWeight: "700",
    },
});