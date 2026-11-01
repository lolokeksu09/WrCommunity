package com.wrcommunity.editor

import android.content.ContentResolver
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.sceneview.SceneView
import io.github.sceneview.rememberModelInstance
import io.github.sceneview.node.ModelNode
import java.io.DataInputStream

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { EditorScreen() }
    }
}

@Composable
private fun EditorScreen() {
    val context = LocalContext.current
    var modelUri by rememberSaveable { mutableStateOf<String?>(null) }
    var modelName by rememberSaveable { mutableStateOf("Нет модели") }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            val error = runCatching {
                context.contentResolver.openInputStream(uri)?.use { stream ->
                    val header = ByteArray(12)
                    DataInputStream(stream).readFully(header)
                    GlbHeader.error(header)
                } ?: "Не удалось прочитать файл."
            }.getOrElse { "Ошибка чтения GLB: " + (it.message ?: "нет доступа") }
            if (error != null) {
                errorMessage = error
            } else {
                runCatching {
                    context.contentResolver.takePersistableUriPermission(
                        uri, Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
                }
                modelUri = uri.toString()
                modelName = displayName(context.contentResolver, uri) ?: "Модель GLB"
                errorMessage = null
            }
        }
    }

    MaterialTheme(colorScheme = darkColorScheme(
        primary = Color(0xFFE9E9F1),
        background = Color(0xFF08090D),
        surface = Color(0xFF13141B)
    )) {
        Column(Modifier.fillMaxSize().background(Color(0xFF08090D))) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(Modifier.weight(1f)) {
                    Text("3D Editor", fontWeight = FontWeight.Bold)
                    Text(modelName, style = MaterialTheme.typography.labelMedium, color = Color.LightGray)
                }
                Button(
                    onClick = { picker.launch(arrayOf("*/*")) },
                    shape = RoundedCornerShape(12.dp)
                ) { Text("Открыть GLB") }
            }

            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (modelUri == null) {
                    Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Открой 3D-модель", style = MaterialTheme.typography.titleLarge)
                        Spacer(Modifier.height(8.dp))
                        Text("GLB 2.0 • файлы остаются на устройстве", color = Color.LightGray)
                    }
                } else {
                    key(modelUri) {
                        SceneView(modifier = Modifier.fillMaxSize()) {
                            rememberModelInstance(modelLoader = modelLoader, fileLocation = modelUri!!)?.let {
                                ModelNode(modelInstance = it, scaleToUnits = 1.0f, autoAnimate = false)
                            }
                        }
                    }
                }
            }

            if (errorMessage != null) {
                Text(
                    errorMessage!!,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    color = Color(0xFFFFA8A8)
                )
            }
            Text(
                "Повернуть: один палец   •   Масштаб: два пальца",
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                style = MaterialTheme.typography.bodySmall,
                color = Color.LightGray
            )
        }
    }
}

private fun displayName(resolver: ContentResolver, uri: Uri): String? {
    var result: String? = null
    runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor: Cursor ->
            if (cursor.moveToFirst()) result = cursor.getString(0)
        }
    }
    return result
}
