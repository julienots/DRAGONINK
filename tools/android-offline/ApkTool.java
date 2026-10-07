import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;

import java.io.*;
import java.nio.file.*;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.zip.*;

/**
 * Outil d'empaquetage APK hors ligne :
 *   pack   <out.apk> <stagingDir>       zip avec alignement 4 octets des entrées non compressées
 *   sign   <in.apk> <out.apk> <keystore.p12> <pass> <alias>   signature v2 (apksig, minSdk 24)
 *   verify <apk>
 */
public class ApkTool {
    static final Set<String> STORED_EXT = new HashSet<>(Arrays.asList("arsc", "png", "jpg", "woff", "woff2", "mp3", "ogg"));

    public static void main(String[] a) throws Exception {
        switch (a[0]) {
            case "pack": pack(new File(a[1]), Paths.get(a[2])); break;
            case "sign": sign(new File(a[1]), new File(a[2]), new File(a[3]), a[4], a[5]); break;
            case "verify": verify(new File(a[1])); break;
            default: throw new IllegalArgumentException(a[0]);
        }
    }

    static class Counting extends FilterOutputStream {
        long n = 0;
        Counting(OutputStream o) { super(o); }
        @Override public void write(int b) throws IOException { out.write(b); n++; }
        @Override public void write(byte[] b, int off, int len) throws IOException { out.write(b, off, len); n += len; }
    }

    static void pack(File out, Path root) throws IOException {
        List<Path> files = new ArrayList<>();
        try (java.util.stream.Stream<Path> s = Files.walk(root)) { s.filter(Files::isRegularFile).forEach(files::add); }
        files.sort(Comparator.comparing((Path p) -> {
            String r = root.relativize(p).toString().replace('\\', '/');
            // ordre conventionnel : manifeste, dex, ressources, puis le reste
            if (r.equals("AndroidManifest.xml")) return "0";
            if (r.endsWith(".dex")) return "1" + r;
            if (r.equals("resources.arsc")) return "2";
            if (r.startsWith("res/")) return "3" + r;
            return "4" + r;
        }));
        Counting cnt = new Counting(new BufferedOutputStream(new FileOutputStream(out)));
        try (ZipOutputStream zos = new ZipOutputStream(cnt)) {
            for (Path p : files) {
                String name = root.relativize(p).toString().replace('\\', '/');
                byte[] data = Files.readAllBytes(p);
                String ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase();
                ZipEntry e = new ZipEntry(name);
                e.setTime(1700000000000L);
                if (STORED_EXT.contains(ext) || name.equals("resources.arsc")) {
                    e.setMethod(ZipEntry.STORED);
                    e.setSize(data.length);
                    e.setCompressedSize(data.length);
                    CRC32 crc = new CRC32(); crc.update(data); e.setCrc(crc.getValue());
                    zos.flush();
                    // en-tête local = 30 octets + nom + extra : on aligne le début des données sur 4
                    long dataStart = cnt.n + 30 + name.getBytes("UTF-8").length;
                    int padLen = (int) ((4 - (dataStart % 4)) % 4);
                    if (padLen > 0) e.setExtra(new byte[padLen]);
                } else {
                    e.setMethod(ZipEntry.DEFLATED);
                }
                zos.putNextEntry(e);
                zos.write(data);
                zos.closeEntry();
            }
        }
        System.out.println("APK non signé : " + out + " (" + files.size() + " fichiers)");
    }

    static void sign(File in, File out, File ks, String pass, String alias) throws Exception {
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream is = new FileInputStream(ks)) { store.load(is, pass.toCharArray()); }
        PrivateKey key = (PrivateKey) store.getKey(alias, pass.toCharArray());
        List<X509Certificate> certs = new ArrayList<>();
        for (java.security.cert.Certificate c : store.getCertificateChain(alias)) certs.add((X509Certificate) c);
        ApkSigner.SignerConfig cfg = new ApkSigner.SignerConfig.Builder("XALA", key, certs).build();
        new ApkSigner.Builder(Collections.singletonList(cfg))
                .setInputApk(in).setOutputApk(out)
                .setMinSdkVersion(24)
                .setV1SigningEnabled(false).setV2SigningEnabled(true) // minSdk 24 : v2 suffit (v1 = Android < 7)
                .build().sign();
        System.out.println("APK signé : " + out);
    }

    static void verify(File apk) throws Exception {
        ApkVerifier.Result r = new ApkVerifier.Builder(apk).build().verify();
        System.out.println("Vérifié : " + r.isVerified() + " · v1=" + r.isVerifiedUsingV1Scheme() + " · v2=" + r.isVerifiedUsingV2Scheme());
        for (ApkVerifier.IssueWithParams e : r.getErrors()) System.out.println("ERREUR " + e);
        for (ApkVerifier.IssueWithParams w : r.getWarnings()) System.out.println("avertissement " + w);
        if (!r.isVerified()) System.exit(2);
    }
}
