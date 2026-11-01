package com.wrcommunity.editor

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.InputStream
import java.util.UUID

/** Copies a SAF document into app-private storage before handing it to SceneView. */
object GlbFileImporter {
    data class ImportedModel(val fileLocation: String)

    suspend fun import(context: Context, uri: Uri): ImportedModel = withContext(Dispatchers.IO) {
        val directory = File(context.cacheDir, "imported-glb")
        if (!directory.isDirectory && !directory.mkdirs()) {
            throw IOException("Не удалось создать папку для модели.")
        }
        val token = UUID.randomUUID().toString()
        val temporary = File(directory, "$token.part")
        val target = File(directory, "$token.glb")
        try {
            val bytesRead = openDocument(context.contentResolver, uri).use { input ->
                temporary.outputStream().buffered().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var total = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        if (read == 0) continue
                        total += read
                        if (total > GlbHeader.MAX_BYTES) {
                            throw IOException("GLB превышает лимит 150 МБ.")
                        }
                        output.write(buffer, 0, read)
                    }
                    total
                }
            }
            val prefix = ByteArray(20)
            temporary.inputStream().use { stream ->
                var offset = 0
                while (offset < prefix.size) {
                    val read = stream.read(prefix, offset, prefix.size - offset)
                    if (read < 0) break
                    offset += read
                }
                if (offset < prefix.size) throw IOException("GLB повреждён или пуст.")
            }
            GlbValidation.error(prefix, bytesRead)?.let { throw IOException(it) }
            if (!temporary.renameTo(target)) throw IOException("Не удалось сохранить импортированную модель.")
            ImportedModel(Uri.fromFile(target).toString())
        } finally {
            temporary.delete()
        }
    }

    private fun openDocument(resolver: ContentResolver, uri: Uri): InputStream {
        val direct = runCatching { resolver.openInputStream(uri) }.getOrNull()
        if (direct != null) return direct
        val descriptor: ParcelFileDescriptor? = runCatching {
            resolver.openFileDescriptor(uri, "r")
        }.getOrNull()
        if (descriptor != null) return ParcelFileDescriptor.AutoCloseInputStream(descriptor)
        throw IOException(
            "Android не разрешил прочитать этот файл. " +
                "Попробуй выбрать GLB через системные «Файлы» из папки «Загрузки»."
        )
    }
}
