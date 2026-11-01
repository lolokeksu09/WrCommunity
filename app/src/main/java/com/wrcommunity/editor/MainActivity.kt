package com.wrcommunity.editor

import android.content.ContentResolver
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.sceneview.SceneView
import io.github.sceneview.rememberModelInstance
import io.github.sceneview.node.ModelNode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { EditorScreen() }
    }
}

@Composable
private fun EditorScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var modelLocation by remember { mutableStateOf<String?>(null) }
    var modelName by remember { mutableStateOf("Нет модели") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isImporting by remember { mutableStateOf(false) }
    var importJob by remember { mutableStateOf<Job?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            importJob?.cancel()
            importJob = scope.launch {
                isImporting = true
                errorMessage = null
                try {
                    val imported = GlbFileImporter.import(context.applicationContext, uri)
                    modelLocation = imported.fileLocation
                    modelName = displayName(context.contentResolver, uri) ?: "Модель GLB"
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    errorMessage = error.message ?: "Не удалось открыть GLB."
                } finally {
                    isImporting = false
                }
            }
        }
    }

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color(0xFFE9E9F1),
            onBackground = Color(0xFFF1F1F7),
            background = Color(0xFF08090D),
            surface = Color(0xFF13141B)
        )
    ) {
        Column(
            Modifier.fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .statusBarsPadding()
                .navigationBarsPadding()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(Modifier.weight(1f)) {
                    Text("3D Editor", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
                    Text(modelName, style = MaterialTheme.typography.labelMedium, color = Color.LightGray)
                }
                Button(
                    onClick = { picker.launch(arrayOf("*/*")) },
                    enabled = !isImporting,
                    shape = RoundedCornerShape(12.dp)
                ) { Text("Открыть GLB") }
            }

            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (modelLocation == null) {
                    Column(
                        Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        if (isImporting) {
                            CircularProgressIndicator()
                            Spacer(Modifier.height(16.dp))
                            Text("Чтение модели…", color = MaterialTheme.colorScheme.onBackground)
                        } else {
                            Text(
                                "Открой 3D-модель",
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "GLB 2.0 • файлы остаются на устройстве",
                                color = Color.LightGray
                            )
                        }
                    }
                } else {
                    key(modelLocation) {
                        SceneView(modifier = Modifier.fillMaxSize()) {
                            rememberModelInstance(
                                modelLoader = modelLoader,
                                fileLocation = modelLocation!!
                            )?.let { model ->
                                ModelNode(modelInstance = model, scaleToUnits = 1.0f, autoAnimate = false)
                            }
                        }
                    }
                    if (isImporting) {
                        CircularProgressIndicator(Modifier.align(Alignment.Center))
                    }
                }
            }

            if (errorMessage != null) {
                Text(
                    errorMessage!!,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    color = Color(0xFFFFB4AB),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            Text(
                "Поворот: один палец  •  Масштаб: два пальца",
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                style = MaterialTheme.typography.bodySmall,
                color = Color.LightGray
            )
        }
    }
}

private fun displayName(resolver: ContentResolver, uri: Uri): String? {
    return runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor: Cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
    }.getOrNull()
}
