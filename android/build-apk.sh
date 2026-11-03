#!/usr/bin/env bash
# Build a signed Android APK that wraps the single-file game in a full-screen WebView.
# Needs: JDK 17+, Android SDK with "platforms;android-34" and "build-tools;34.0.0".
# Usage: ANDROID_HOME=/path/to/sdk KEYSTORE=my.keystore KS_PASS=secret KS_ALIAS=wm ./android/build-apk.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
BT="$ANDROID_HOME/build-tools/34.0.0"; JAR="$ANDROID_HOME/platforms/android-34/android.jar"
: "${KEYSTORE:?set KEYSTORE (create one with keytool -genkeypair)}"; : "${KS_PASS:?}"; KS_ALIAS="${KS_ALIAS:-wm}"
npm run build                      # -> build/index.html (release engine if dist/littlejs.release.js exists)
OUT=android/out; rm -rf "$OUT"; mkdir -p "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/assets"
cp build/index.html "$OUT/assets/index.html"
"$BT/aapt2" compile --dir android/res -o "$OUT/res/"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$JAR" --manifest android/AndroidManifest.xml -A "$OUT/assets" --java "$OUT/gen" "$OUT"/res/*.flat --min-sdk-version 24 --target-sdk-version 34
javac -source 8 -target 8 -nowarn -classpath "$JAR" -d "$OUT/classes" android/src/com/jamesscott/warehousemanager/*.java "$OUT/gen/com/jamesscott/warehousemanager/R.java"
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT/" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/unsigned.apk"; (cd "$OUT" && zip -q -j unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias "$KS_ALIAS" --out WarehouseManager.apk "$OUT/aligned.apk"
"$BT/apksigner" verify WarehouseManager.apk && echo "Built WarehouseManager.apk"
