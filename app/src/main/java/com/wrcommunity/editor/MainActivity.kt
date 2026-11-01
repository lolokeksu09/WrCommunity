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
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.ImageBitmap
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

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

private enum class CameraView(val label: String) {
    FRONT("Спереди"), RIGHT("Справа"), BACK("Сзади"), LEFT("Слева"), TOP("Сверху");

    fun eye() = when (this) {
        FRONT -> Position(0f, 0f, 2.45f)
        RIGHT -> Position(2.45f, 0f, 0f)
        BACK -> Position(0f, 0f, -2.45f)
        LEFT -> Position(-2.45f, 0f, 0f)
        TOP -> Position(0f, 2.45f, 0.01f)
    }
}

private enum class Tool(val label: String) {
    ROTATE("Поворот"), MOVE("Позиция"), SCALE("Масштаб")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditorScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var modelLocation by remember { mutableStateOf<String?>(null) }
    var originalLocation by remember { mutableStateOf<String?>(null) }
    var materialLayers by remember { mutableStateOf<List<MaterialLayer>>(emptyList()) }
    var layerHistory by remember { mutableStateOf(LayerHistory()) }
    var showLayers by remember { mutableStateOf(false) }
    var layerBusy by remember { mutableStateOf(false) }
    var cameraView by remember { mutableStateOf(CameraView.FRONT) }
    var viewMenu by remember { mutableStateOf(false) }
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
    val visibleMaterials = layerHistory.current

    // A change in layer visibility creates an independent preview GLB.
    // Cancellation prevents stale previews overwriting newer selections.
    LaunchedEffect(originalLocation, visibleMaterials) {
        val origin = originalLocation ?: return@LaunchedEffect
        val allIds = materialLayers.map { it.id }.toSet()
        if (visibleMaterials == allIds) {
            modelLocation = origin
            layerBusy = false
            return@LaunchedEffect
        }
        layerBusy = true
        try {
            modelLocation = GlbLayers.preview(context.applicationContext, origin, visibleMaterials)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            message = e.message ?: "Не удалось изменить видимость слоёв."
        } finally {
            layerBusy = false
        }
    }

    // A large reference photo must not freeze the rendering/gesture thread.
    val referenceBitmap by produceState<ImageBitmap?>(null, referenceUri) {
        val uri = referenceUri ?: return@produceState
        value = withContext(Dispatchers.IO) {
            runCatching {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                context.contentResolver.openInputStream(uri)?.use {
                    BitmapFactory.decodeStream(it, null, bounds)
                }
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@runCatching null
                var sampleSize = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / sampleSize > 768) {
                    sampleSize *= 2
                }
                context.contentResolver.openInputStream(uri)?.use {
                    BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply {
                        inSampleSize = sampleSize
                    })?.asImageBitmap()
                }
            }.getOrNull()
        }
    }

    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            job?.cancel()
            val request = ++requestId
            job = scope.launch {
                busy = true
                message = null
                try {
                    val loaded = GlbFileImporter.import(context.applicationContext, uri)
                    val groups = GlbLayers.describe(context.applicationContext, loaded.fileLocation)
                    if (request == requestId) {
                        materialLayers = groups
                        layerHistory = LayerHistory(states = listOf(groups.map { it.id }.toSet()))
                        originalLocation = loaded.fileLocation
                        modelLocation = loaded.fileLocation
                        modelName = displayName(context.contentResolver, uri) ?: "Модель GLB"
                        history = EditHistory()
                        cameraEpoch++
                        cameraView = CameraView.FRONT
                        showLayers = false
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
        if (uri != null && originalLocation != null) {
            val location = originalLocation!!
            val snapshot = edit
            val selectedMaterials = layerHistory.current
            scope.launch {
                busy = true
                try {
                    GlbTransformExporter.export(context.applicationContext, location, uri, snapshot,
                        selectedMaterials.takeIf { materialLayers.isNotEmpty() })
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
                    val cameraManipulator = key(cameraEpoch, cameraView) {
                        rememberCameraManipulator(
                            orbitHomePosition = cameraView.eye(),
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
                        modifier = Modifier.align(Alignment.TopEnd).fillMaxWidth()
                            .horizontalScroll(rememberScrollState()).padding(10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box {
                            CompactAction("Вид", description = "Выбрать положение камеры",
                                onClick = { viewMenu = true })
                            DropdownMenu(expanded = viewMenu, onDismissRequest = { viewMenu = false }) {
                                CameraView.entries.forEach { preset ->
                                    DropdownMenuItem(
                                        text = { Text(preset.label) },
                                        onClick = {
                                            cameraView = preset
                                            cameraEpoch++
                                            viewMenu = false
                                        }
                                    )
                                }
                            }
                        }
                        CompactAction("Сброс", description = "Сбросить положение камеры", onClick = { cameraEpoch++ })
                        CompactAction("Слои", description = "Управление видимостью материалов",
                            enabled = materialLayers.isNotEmpty(),
                            onClick = { showLayers = true })
                        CompactAction("Инфо", onClick = { showInfo = !showInfo })
                        CompactAction("Реф.", onClick = {
                            if (referenceUri == null) referencePicker.launch("image/*")
                            else showReference = !showReference
                        })
                        if (referenceUri != null) {
                            CompactAction("Сменить", description = "Выбрать другой референс",
                                onClick = { referencePicker.launch("image/*") })
                        }
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
                    val image = referenceBitmap
                    if (showReference && image != null) {
                        Image(
                            bitmap = image,
                            contentDescription = "Эталонное изображение персонажа",
                            modifier = Modifier.align(Alignment.BottomStart).padding(12.dp)
                                .size(116.dp).clip(RoundedCornerShape(12.dp))
                                .border(1.dp, Color.DarkGray, RoundedCornerShape(12.dp)),
                            contentScale = ContentScale.Fit
                        )
                    }
                    if (busy || layerBusy) CircularProgressIndicator(Modifier.align(Alignment.Center))
                }
            }

            if (materialLayers.isNotEmpty() && modelLocation != null) {
                Row(
                    modifier = Modifier.fillMaxWidth().background(PanelTone)
                        .padding(horizontal = 14.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Видно слоёв: ${layerHistory.current.size} / ${materialLayers.size}",
                        style = MaterialTheme.typography.labelSmall, color = TextSecondary,
                        modifier = Modifier.weight(1f))
                    TextButton(onClick = { showLayers = true }) { Text("Управлять слоями") }
                }
            }

            if (message != null) {
                Text(
                    message!!, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                    color = if (message!!.startsWith("GLB сохранён")) Color(0xFF96DFBE) else Color(0xFFFFB4AB),
                    style = MaterialTheme.typography.bodySmall
                )
            }

            if (showLayers && materialLayers.isNotEmpty()) {
                ModalBottomSheet(
                    onDismissRequest = { showLayers = false },
                    containerColor = PanelTone
                ) {
                    Column(
                        Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Слои модели", style = MaterialTheme.typography.titleLarge)
                        Text("Скрывай материалы целиком, чтобы осматривать детали. Сетка и текстуры не изменяются.",
                            style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                enabled = layerHistory.canUndo && !layerBusy,
                                onClick = { layerHistory = layerHistory.undo() }
                            ) { Text("Отменить") }
                            OutlinedButton(
                                enabled = layerHistory.canRedo && !layerBusy,
                                onClick = { layerHistory = layerHistory.redo() }
                            ) { Text("Повторить") }
                            TextButton(onClick = {
                                layerHistory = layerHistory.change(materialLayers.map { it.id }.toSet())
                            }) { Text("Показать все") }
                        }
                        Column(Modifier.heightIn(max = 340.dp).verticalScroll(rememberScrollState())) {
                            materialLayers.forEach { layer ->
                                val visible = layer.id in layerHistory.current
                                Row(
                                    Modifier.fillMaxWidth().heightIn(min = 56.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Checkbox(
                                        checked = visible,
                                        enabled = !layerBusy && (!visible || layerHistory.current.size > 1),
                                        onCheckedChange = { checked ->
                                            val next = layerHistory.current.toMutableSet()
                                            if (checked) next.add(layer.id) else next.remove(layer.id)
                                            layerHistory = layerHistory.change(next)
                                        }
                                    )
                                    Column(Modifier.weight(1f)) {
                                        Text(layer.name, maxLines = 2,
                                            style = MaterialTheme.typography.bodyMedium)
                                        Text("Поверхностей: ${layer.primitives}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = TextSecondary)
                                    }
                                    TextButton(
                                        enabled = !layerBusy,
                                        onClick = { layerHistory = layerHistory.change(setOf(layer.id)) }
                                    ) { Text("Соло") }
                                }
                            }
                        }
                        Text("При сохранении скрытые части не отображаются в экспортированном GLB. Исходный файл остаётся без изменений.",
                            style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                        Button(onClick = { showLayers = false }, Modifier.fillMaxWidth()) { Text("Готово") }
                        Spacer(Modifier.height(8.dp))
                    }
                }
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
