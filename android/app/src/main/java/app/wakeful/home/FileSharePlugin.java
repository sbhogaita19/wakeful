package app.wakeful.home;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;

/**
 * Hands a file the app has just built (a PDF summary or an encrypted backup) to Android's share sheet.
 * The file is written to the app's private cache, shared through a FileProvider URI, and cleared on the next
 * share and every time the app starts. Nothing is uploaded by Wakeful.
 */
@CapacitorPlugin(name = "FileShare")
public class FileSharePlugin extends Plugin {

    private File dir() {
        File d = new File(getContext().getCacheDir(), "shared");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private void clear() {
        File[] files = dir().listFiles();
        if (files != null) for (File f : files) f.delete();
    }

    @Override
    public void load() {
        clear();
    }

    @PluginMethod
    public void share(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        String mime = call.getString("mime", "application/octet-stream");
        String title = call.getString("title", "Wakeful");
        if (name == null || data == null) {
            call.reject("name and data are required");
            return;
        }
        try {
            clear();
            File file = new File(dir(), name.replaceAll("[^A-Za-z0-9._-]", "_"));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, title));
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not share the file");
        }
    }
}
