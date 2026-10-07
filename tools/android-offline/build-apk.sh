#!/usr/bin/env bash
# Construction de l'APK "standalone" SANS le SDK Android (environnements où
# dl.google.com est inaccessible). Utilise :
#   - android-all (Robolectric, Maven Central) comme android.jar de compilation
#   - dalvik-dx (Maven Central) pour produire classes.dex
#   - apksig (Maven Central) pour la signature v1 + v2
#   - axml.py pour le manifeste binaire et resources.arsc
# Sur une machine avec Android Studio / SDK, préférer Gradle :
#   cd android && ./gradlew assembleStandaloneRelease bundlePlayRelease
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOOLS="${XALA_TOOLS_DIR:-$ROOT/build-output/tools}"
OUT="$ROOT/build-output"
STAGE="$OUT/tmp/stage"
CLS="$OUT/tmp/classes"
PKG="com.superessence.xalamonsters.standalone"
VERSION_NAME="$(node -p "require('$ROOT/package.json').version")"
VERSION_CODE="${XALA_VERSION_CODE:-1}"
MVN="https://repo1.maven.org/maven2"

mkdir -p "$TOOLS" "$OUT"
fetch() { [ -s "$TOOLS/$2" ] || curl -sSfL -o "$TOOLS/$2" "$MVN/$1"; }
fetch org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar android-all.jar
fetch com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar dx.jar
fetch com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar apksig.jar

[ -f "$ROOT/android/app/src/main/assets/www/index.html" ] || { echo "Assets web absents : npm run build && npm run android:sync"; exit 1; }

rm -rf "$OUT/tmp" && mkdir -p "$STAGE" "$CLS" "$OUT/tmp/tool"

echo "▶ Compilation Java"
javac -nowarn -Xlint:-options --release 8 -encoding UTF-8 -cp "$TOOLS/android-all.jar" -d "$CLS" \
  "$ROOT"/android/app/src/main/java/com/superessence/xalamonsters/*.java \
  "$ROOT"/android/app/src/standalone/java/com/superessence/xalamonsters/*.java

echo "▶ Dex"
java -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$STAGE/classes.dex" "$CLS"

echo "▶ Manifeste binaire + ressources"
python3 "$ROOT/tools/android-offline/axml.py" "{\"package\":\"$PKG\",\"activity\":\"com.superessence.xalamonsters.MainActivity\",\"label\":\"XalaMonsters\",\"versionCode\":$VERSION_CODE,\"versionName\":\"$VERSION_NAME\",\"minSdk\":24,\"targetSdk\":34,\"targetSdkName\":\"14\"}" "$STAGE"
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  mkdir -p "$STAGE/res/mipmap-$d-v4"
  cp "$ROOT/android/app/src/main/res/mipmap-$d/ic_launcher.png" "$STAGE/res/mipmap-$d-v4/ic_launcher.png"
done
mkdir -p "$STAGE/assets"
cp -r "$ROOT/android/app/src/main/assets/www" "$STAGE/assets/www"

echo "▶ Empaquetage + signature"
# apksig 2.3 utilise des API internes du JDK : on les expose explicitement
JOPTS="-Dstdout.encoding=UTF-8 --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED"
javac -nowarn -cp "$TOOLS/apksig.jar" -d "$OUT/tmp/tool" "$ROOT/tools/android-offline/ApkTool.java"
java $JOPTS -cp "$OUT/tmp/tool:$TOOLS/apksig.jar" ApkTool pack "$OUT/tmp/unsigned.apk" "$STAGE"
KS="${XALA_KEYSTORE:-$ROOT/android/debug-xala.keystore}"
KS_PASS="${XALA_KEYSTORE_PASS:-xaladebug}"
KS_ALIAS="${XALA_KEY_ALIAS:-xala}"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$KS_PASS" -keypass "$KS_PASS" -alias "$KS_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=XalaMonsters Debug, O=SUPERESSENCE, C=FR" >/dev/null 2>&1
fi
APK="$OUT/XalaMonsters-$VERSION_NAME-standalone.apk"
java $JOPTS -cp "$OUT/tmp/tool:$TOOLS/apksig.jar" ApkTool sign "$OUT/tmp/unsigned.apk" "$APK" "$KS" "$KS_PASS" "$KS_ALIAS"
java $JOPTS -cp "$OUT/tmp/tool:$TOOLS/apksig.jar" ApkTool verify "$APK"
ls -la "$APK"
