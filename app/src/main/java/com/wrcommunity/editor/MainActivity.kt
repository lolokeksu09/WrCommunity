package com.wrcommunity.editor

import android.content.ContentResolver
import android.database.Cursor
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.sceneview.SceneView
import io.github.sceneview.rememberCameraManipulator
import io.github.sceneview.math.Position
import io.github.sceneview.math.Rotation
import io.github.sceneview.math.Scale
import io.github.sceneview.node.ModelNode
import io.github.sceneview.rememberModelInstance
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

private val Ink = Color(0xFF090A0E)
private val PanelTone = Color(0xFF181A22)
private val Highlight = Color(0xFFC5B9FF)
private val TextPrimary = Color(0xFFF3F0FB)
private val TextSecondary = Color(0xFFB6B6C5)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { EditorScreen() }
    }
}

private enum class Tool(val label: String) {
    ROTATE("Поворот"), MOVE("Позиция"), SCALE("Масштаб")
}

@Composable
private fun EditorScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var modelLocation by remember { mutableStateOf<String?>(null) }
    var modelName by remember { mutableStateOf("Нет модели") }
    var history by remember { mutableStateOf(EditHistory()) }
    var tool by remember { mutableStateOf(Tool.ROTATE) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var requestId by remember { mutableIntStateOf(0) }
    var job by remember { mutableStateOf<Job?>(null) }
    var cameraEpoch by remember { mutableIntStateOf(0) }
    var showInfo by remember { mutableStateOf(false) }
    var referenceUri by remember { mutableStateOf<Uri?>(null) }
    var showReference by remember { mutableStateOf(true) }
    val edit = history.current

    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            job?.cancel()
            val request = ++requestId
            job = scope.launch {
                busy = true
                message = null
                try {
                    val loaded = GlbFileImporter.import(context.applicationContext, uri)
                    if (request == requestId) {
                        modelLocation = loaded.fileLocation
                        modelName = displayName(context.contentResolver, uri) ?: "Модель GLB"
                        history = EditHistory()
                        cameraEpoch++
                        message = null
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    if (request == requestId) message = error.message ?: "Не удалось открыть GLB."
                } finally {
                    if (request == requestId) busy = false
                }
            }
        }
    }
    val exportPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("model/gltf-binary")
    ) { uri ->
        if (uri != null && modelLocation != null) {
            val location = modelLocation!!
            val snapshot = edit
            scope.launch {
                busy = true
                try {
                    GlbTransformExporter.export(context.applicationContext, location, uri, snapshot)
                    message = "GLB сохранён. Исходная модель не изменена."
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    message = error.message ?: "Не удалось сохранить GLB."
                } finally {
                    busy = false
                }
            }
        }
    }
    val referencePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            referenceUri = uri
            showReference = true
        }
    }

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Highlight,
            onPrimary = Color(0xFF20143F),
            background = Ink,
            onBackground = TextPrimary,
            surface = PanelTone,
            onSurface = TextPrimary
        )
    ) {
        Column(
            Modifier.fillMaxSize()
                .background(Ink)
                .statusBarsPadding()
                .navigationBarsPadding()
        ) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 68.dp).padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Column(Modifier.weight(1f)) {
                    Text("3D Editor", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(modelName, style = MaterialTheme.typography.labelMedium, color = TextSecondary,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                FilledTonalButton(
                    onClick = { importPicker.launch(arrayOf("*/*")) },
                    enabled = !busy,
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    modifier = Modifier.heightIn(min = 48.dp)
                ) { Text("Открыть") }
                Button(
                    onClick = { exportPicker.launch(modelName.substringBeforeLast('.', modelName) + "_edited.glb") },
                    enabled = !busy && modelLocation != null,
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    modifier = Modifier.heightIn(min = 48.dp)
                ) { Text("Сохранить") }
            }
            Box(Modifier.weight(1f).fillMaxWidth().background(Color.Black)) {
                if (modelLocation == null) {
                    Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                        if (busy) {
                            CircularProgressIndicator()
                            Spacer(Modifier.height(12.dp))
                            Text("Чтение модели…", color = TextPrimary)
                        } else {
                            Text("Твоя модель в центре внимания", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(8.dp))
                            Text("Открой GLB для просмотра и правки", color = TextSecondary)
                        }
                    }
                } else {
                    // SceneView swaps manipulators without rebuilding the 3D scene.
                    val cameraManipulator = key(cameraEpoch) {
                        rememberCameraManipulator(
                            orbitHomePosition = Position(0f, 0f, 2.45f),
                            targetPosition = Position(0f, 0f, 0f)
                        )
                    }
                    key(modelLocation) {
                        SceneView(
                            modifier = Modifier.fillMaxSize(),
                            cameraManipulator = cameraManipulator
                        ) {
                            rememberModelInstance(
                                modelLoader = modelLoader,
                                fileLocation = modelLocation!!
                            )?.let { instance ->
                                // SceneScope's composable Node/ModelNode attach themselves to
                                // the actual Filament scene. A standalone class ModelNode does not.
                                Node(
                                    position = Position(edit.moveX, edit.moveY, edit.moveZ),
                                    rotation = Rotation(edit.x.toFloat(), edit.y.toFloat(), edit.z.toFloat()),
                                    scale = Scale(edit.scalePercent / 100f)
                                ) {
                                    ModelNode(
                                        modelInstance = instance,
                                        scaleToUnits = 1.5f,
                                        autoAnimate = false
                                    )
                                }
                            }
                        }
                    }
                }

                if (modelLocation != null) {
                    Row(
                        modifier = Modifier.align(Alignment.TopEnd).padding(10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        CompactAction("Камера", onClick = { cameraEpoch++ })
                        CompactAction("Инфо", onClick = { showInfo = !showInfo })
                        CompactAction("Реф.", onClick = {
                            if (referenceUri == null) referencePicker.launch("image/*")
                            else showReference = !showReference
                        })
                    }
                    if (showInfo) {
                        Surface(
                            modifier = Modifier.align(Alignment.TopStart).padding(12.dp).widthIn(max = 230.dp),
                            color = Color(0xE51D1C28),
                            shape = RoundedCornerShape(14.dp)
                        ) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("Трансформация GLB", fontWeight = FontWeight.SemiBold)
                                Text("Углы: ${edit.x}° / ${edit.y}° / ${edit.z}°", style = MaterialTheme.typography.bodySmall)
                                Text("Масштаб: ${edit.scalePercent}%", style = MaterialTheme.typography.bodySmall)
                                Text("Экспорт сохраняет исходную сетку и текстуры.", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                            }
                        }
                    }
                    if (showReference && referenceUri != null) {
                        val referenceBitmap = remember(referenceUri) {
                            runCatching {
                                context.contentResolver.openInputStream(referenceUri!!)?.use {
                                    BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 4 })
                                }?.asImageBitmap()
                            }.getOrNull()
                        }
                        if (referenceBitmap != null) {
                            Image(
                                bitmap = referenceBitmap,
                                contentDescription = "Эталонное изображение персонажа",
                                modifier = Modifier.align(Alignment.BottomStart).padding(12.dp)
                                    .size(116.dp).clip(RoundedCornerShape(12.dp))
                                    .border(1.dp, Color.DarkGray, RoundedCornerShape(12.dp)),
                                contentScale = ContentScale.Fit
                            )
                        }
                    }
                    if (busy) CircularProgressIndicator(Modifier.align(Alignment.Center))
                }
            }

            if (message != null) {
                Text(
                    message!!, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                    color = if (message!!.startsWith("GLB сохранён")) Color(0xFF96DFBE) else Color(0xFFFFB4AB),
                    style = MaterialTheme.typography.bodySmall
                )
            }

            if (modelLocation != null) {
                Column(
                    Modifier.fillMaxWidth().background(PanelTone)
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                ) {
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Tool.entries.forEach { item ->
                                val chosen = tool == item
                                if (chosen) {
                                    Button(onClick = { tool = item }, modifier = Modifier.heightIn(min = 44.dp),
                                        contentPadding = PaddingValues(horizontal = 12.dp)) { Text(item.label) }
                                } else {
                                    OutlinedButton(onClick = { tool = item }, modifier = Modifier.heightIn(min = 44.dp),
                                        contentPadding = PaddingValues(horizontal = 12.dp)) { Text(item.label) }
                                }
                            }
                        }
                        CompactAction("↶", enabled = history.canUndo, description = "Отменить", onClick = { history = history.undo() })
                        CompactAction("↷", enabled = history.canRedo, description = "Повторить", onClick = { history = history.redo() })
                    }
                    Spacer(Modifier.height(8.dp))
                    when (tool) {
                        Tool.ROTATE -> {
                            Stepper("X", "${edit.x}°", { history = history.change(edit.copy(x = edit.x - 15)) },
                                { history = history.change(edit.copy(x = edit.x + 15)) })
                            Stepper("Y", "${edit.y}°", { history = history.change(edit.copy(y = edit.y - 15)) },
                                { history = history.change(edit.copy(y = edit.y + 15)) })
                            Stepper("Z", "${edit.z}°", { history = history.change(edit.copy(z = edit.z - 15)) },
                                { history = history.change(edit.copy(z = edit.z + 15)) })
                        }
                        Tool.MOVE -> {
                            Stepper("X", "%.1f".format(java.util.Locale.US, edit.moveX),
                                { history = history.change(edit.copy(moveX = (edit.moveX - 0.1f).coerceAtLeast(-5f))) },
                                { history = history.change(edit.copy(moveX = (edit.moveX + 0.1f).coerceAtMost(5f))) })
                            Stepper("Y", "%.1f".format(java.util.Locale.US, edit.moveY),
                                { history = history.change(edit.copy(moveY = (edit.moveY - 0.1f).coerceAtLeast(-5f))) },
                                { history = history.change(edit.copy(moveY = (edit.moveY + 0.1f).coerceAtMost(5f))) })
                            Stepper("Z", "%.1f".format(java.util.Locale.US, edit.moveZ),
                                { history = history.change(edit.copy(moveZ = (edit.moveZ - 0.1f).coerceAtLeast(-5f))) },
                                { history = history.change(edit.copy(moveZ = (edit.moveZ + 0.1f).coerceAtMost(5f))) })
                        }
                        Tool.SCALE -> Stepper("Размер", "${edit.scalePercent}%",
                            { history = history.change(edit.copy(scalePercent = (edit.scalePercent - 10).coerceAtLeast(10))) },
                            { history = history.change(edit.copy(scalePercent = (edit.scalePercent + 10).coerceAtMost(400))) })
                    }
                    Row(
                        Modifier.fillMaxWidth().padding(top = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Два пальца — масштаб камеры", style = MaterialTheme.typography.labelSmall,
                            color = TextSecondary, maxLines = 1)
                        TextButton(onClick = { history = history.change(ModelEdit()) },
                            enabled = !edit.isIdentity) { Text("Сбросить правки") }
                    }
                }
            } else {
                Text(
                    "Без аккаунта · исходные файлы не меняются",
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    style = MaterialTheme.typography.labelSmall, color = TextSecondary
                )
            }
        }
    }
}

@Composable
private fun CompactAction(
    label: String,
    enabled: Boolean = true,
    description: String = label,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        color = Color(0xED292B34),
        contentColor = TextPrimary,
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 44.dp)
            .semantics { contentDescription = description }
    ) {
        Box(Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 44.dp).padding(horizontal = 8.dp),
            contentAlignment = Alignment.Center) {
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun Stepper(label: String, value: String, decrease: () -> Unit, increase: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(label, Modifier.width(58.dp), style = MaterialTheme.typography.titleSmall, color = TextSecondary)
        Text(value, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = TextPrimary)
        CompactAction("−", description = "Уменьшить $label", onClick = decrease)
        CompactAction("+", description = "Увеличить $label", onClick = increase)
    }
}

private fun displayName(resolver: ContentResolver, uri: Uri): String? =
    runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor: Cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
    }.getOrNull()
