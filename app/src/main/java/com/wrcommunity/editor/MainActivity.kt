package com.wrcommunity.editor

import android.content.ContentResolver
import android.database.Cursor
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.view.MotionEvent
import java.io.File
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
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
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberCameraNode
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
    var savedSource by remember { mutableStateOf<StoredModel?>(null) }
    var recoveryReady by remember { mutableStateOf(false) }
    var autosaveProblem by remember { mutableStateOf<String?>(null) }
    var materialLayers by remember { mutableStateOf<List<MaterialLayer>>(emptyList()) }
    var layerHistory by remember { mutableStateOf(LayerHistory()) }
    var partHistory by remember { mutableStateOf(PartHistory()) }
    var sculptHistory by remember { mutableStateOf(SculptHistory()) }
    var sculptDraft by remember { mutableStateOf(SculptStroke(materialId = 0)) }
    var sculptMode by remember { mutableStateOf(false) }
    var selectedPartId by remember { mutableStateOf<Int?>(null) }
    var surfacePicker by remember { mutableStateOf<GlbSurfacePicker?>(null) }
    var pickerLocation by remember { mutableStateOf<String?>(null) }
    var nodeLocation by remember { mutableStateOf<String?>(null) }
    var suggestedStrokes by remember { mutableStateOf<List<SculptStroke>>(emptyList()) }
    var pickingBusy by remember { mutableStateOf(false) }
    val traceRays = remember { mutableListOf<SurfaceRay>() }
    val previousScreenPoint = remember { floatArrayOf(Float.NaN, Float.NaN) }
    var isPickingBrushCenter by remember { mutableStateOf(false) }
    var materialBounds by remember { mutableStateOf<Map<Int, BrushMaterialBounds>>(emptyMap()) }
    var modelForPicking by remember { mutableStateOf<io.github.sceneview.node.ModelNode?>(null) }
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
    val partEdits = partHistory.current
    val sculptStrokes = sculptHistory.current

    // Flush the current edit immediately when Android backgrounds the editor.
    // The background worker survives destruction of this Compose screen.
    val pauseDraft = if (recoveryReady) savedSource?.let { source ->
        EditorDraft(
            source = source, name = modelName, global = edit,
            visible = visibleMaterials, parts = partEdits,
            strokes = sculptStrokes, selected = selectedPartId,
            brush = sculptDraft, camera = cameraView.name
        )
    } else null
    val currentPauseDraft by rememberUpdatedState(pauseDraft)
    DisposableEffect(context) {
        val lifecycle = (context as ComponentActivity).lifecycle
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> currentPauseDraft?.let {
                    EditorSessionStore.saveWhenPaused(context.applicationContext.filesDir, it)
                }
                Lifecycle.Event.ON_RESUME -> EditorSessionStore.backgroundSaveError()?.let {
                    autosaveProblem = it
                }
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    // Restore the last unfinished edit from app-private persistent storage.
    // All expensive file reading and checksum work runs off the UI thread.
    LaunchedEffect(Unit) {
        busy = true
        try {
            val draft = EditorSessionStore.restore(context.applicationContext.filesDir)
            if (draft != null) {
                val location = Uri.fromFile(draft.source.file).toString()
                val groups = GlbLayers.describe(context.applicationContext, location)
                val available = groups.map { it.id }.toSet()
                if (available.isEmpty() || draft.visible.isEmpty() ||
                    !draft.visible.all { it in available } ||
                    !draft.parts.keys.all { it in available } ||
                    !draft.strokes.all { it.materialId in available }) {
                    throw java.io.IOException("Слои черновика не совпадают с моделью.")
                }
                val bounds = withContext(Dispatchers.IO) {
                    runCatching { GlbBrushTarget.fromFile(draft.source.file) }
                        .getOrDefault(emptyMap())
                }
                materialBounds = bounds
                materialLayers = groups
                layerHistory = LayerHistory(states = listOf(draft.visible))
                partHistory = PartHistory(steps = listOf(draft.parts))
                sculptHistory = SculptHistory(states = listOf(draft.strokes))
                history = EditHistory(steps = listOf(draft.global))
                sculptDraft = draft.brush
                selectedPartId = draft.selected?.takeIf { it in available }
                cameraView = CameraView.entries.firstOrNull { it.name == draft.camera }
                    ?: CameraView.FRONT
                cameraEpoch++
                modelName = draft.name
                originalLocation = location
                modelLocation = location
                savedSource = draft.source
                message = "Черновик восстановлен. Правки на месте."
            }
        } catch (e: Exception) {
            message = e.message?.let { "Не удалось восстановить черновик: $it" }
                ?: "Не удалось восстановить черновик."
        } finally {
            recoveryReady = true
            busy = false
        }
    }

    // Autosave lightweight edit metadata, not 150 MB of geometry on each touch.
    // Restart the debounce when any displayed edit changes; canceled writes must
    // not replace a newer manifest.
    LaunchedEffect(recoveryReady, savedSource, modelName, history.current,
        layerHistory.current, partHistory.current, sculptHistory.current,
        selectedPartId, sculptDraft, cameraView) {
        val source = savedSource
        if (!recoveryReady || source == null) return@LaunchedEffect
        kotlinx.coroutines.delay(600)
        val snapshot = EditorDraft(
            source = source, name = modelName, global = history.current,
            visible = layerHistory.current, parts = partHistory.current,
            strokes = sculptHistory.current, selected = selectedPartId,
            brush = sculptDraft, camera = cameraView.name
        )
        try {
            EditorSessionStore.save(context.applicationContext.filesDir, snapshot)
            autosaveProblem = null
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            autosaveProblem = e.message ?: "Ошибка автосохранения."
        }
    }

    // A change in layer visibility creates an independent preview GLB.
    // Cancellation prevents stale previews overwriting newer selections.
    LaunchedEffect(originalLocation, visibleMaterials, partEdits, sculptStrokes) {
        val origin = originalLocation ?: return@LaunchedEffect
        val allIds = materialLayers.map { it.id }.toSet()
        if (visibleMaterials == allIds && partEdits.isEmpty() && sculptStrokes.isEmpty()) {
            modelLocation = origin
            layerBusy = false
            return@LaunchedEffect
        }
        layerBusy = true
        try {
            kotlinx.coroutines.delay(140)
            modelLocation = GlbLayers.preview(
                context.applicationContext, origin, visibleMaterials,
                partEdits.filterKeys { it in visibleMaterials },
                sculptStrokes.filter { it.materialId in visibleMaterials }
            )
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            message = e.message ?: "Не удалось изменить видимость слоёв."
        } finally {
            layerBusy = false
        }
    }

    // Rebuild the picker from the *displayed* GLB, not from the original.
    // After a sculpt stroke, POSITION accessors have changed. A stale picker
    // cannot safely select the next hit. LaunchedEffect cancels obsolete loads.
    LaunchedEffect(modelLocation, partEdits) {
        val location = modelLocation
        pickerLocation = null
        surfacePicker = null
        if (location == null || partEdits.isNotEmpty()) return@LaunchedEffect
        try {
            val picked = withContext(Dispatchers.Default) {
                val local = Uri.parse(location).path
                    ?: throw java.io.IOException("Нет файла предпросмотра.")
                GlbSurfacePicker.fromFile(File(local))
            }
            surfacePicker = picked
            pickerLocation = location
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // Some glTF scenes cannot support accurate ray picking. Keep
            // all manual coordinate-based sculpt controls available.
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
                    val imported = File(Uri.parse(loaded.fileLocation).path
                        ?: throw java.io.IOException("GLB недоступен после импорта."))
                    val stored = EditorSessionStore.importSource(
                        context.applicationContext.filesDir, imported)
                    val persistentLocation = Uri.fromFile(stored.file).toString()
                    val groups = GlbLayers.describe(context.applicationContext, persistentLocation)
                    val targetBounds = withContext(Dispatchers.IO) {
                        runCatching {
                            val local = Uri.parse(persistentLocation).path
                                ?: return@runCatching emptyMap<Int, BrushMaterialBounds>()
                            GlbBrushTarget.fromFile(File(local))
                        }.getOrDefault(emptyMap())
                    }
                    if (request == requestId) {
                        materialBounds = targetBounds
                        isPickingBrushCenter = false
                        modelForPicking = null
                        suggestedStrokes = emptyList()
                        surfacePicker = null
                        pickerLocation = null
                        nodeLocation = null
                        pickingBusy = false
                        materialLayers = groups
                        layerHistory = LayerHistory(states = listOf(groups.map { it.id }.toSet()))
                        partHistory = PartHistory()
                        sculptHistory = SculptHistory()
                        sculptMode = false
                        selectedPartId = null
                        originalLocation = persistentLocation
                        modelLocation = persistentLocation
                        savedSource = stored
                        autosaveProblem = null
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
            val partsSnapshot = partHistory.current.filterKeys { it in selectedMaterials }
            val sculptSnapshot = sculptHistory.current.filter { it.materialId in selectedMaterials }
            scope.launch {
                busy = true
                try {
                    GlbTransformExporter.export(
                        context.applicationContext, location, uri, snapshot,
                        selectedMaterials.takeIf { materialLayers.isNotEmpty() },
                        partsSnapshot, sculptSnapshot
                    )
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
                    enabled = !busy && recoveryReady,
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    modifier = Modifier.heightIn(min = 48.dp)
                ) { Text("Открыть") }
                Button(
                    onClick = { exportPicker.launch(modelName.substringBeforeLast('.', modelName) + "_edited.glb") },
                    enabled = !busy && recoveryReady && modelLocation != null,
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
                    val touchEngine = rememberEngine()
                    val touchCamera = rememberCameraNode(touchEngine)
                    key(modelLocation) {
                        SceneView(
                            engine = touchEngine,
                            cameraNode = touchCamera,
                            modifier = Modifier.fillMaxSize(),
                            cameraManipulator = cameraManipulator,
                            onTouchEvent = { event, _ ->
                                if (!isPickingBrushCenter) false
                                else {
                                    val model = modelForPicking
                                    val picker = surfacePicker
                                    if (model == null || picker == null || pickingBusy ||
                                        pickerLocation != modelLocation ||
                                        nodeLocation != modelLocation || layerBusy) {
                                        isPickingBrushCenter = false
                                        message = "Точная кисть ещё не готова. Используй ручной центр."
                                    } else if (event.pointerCount > 1) {
                                        traceRays.clear()
                                        previousScreenPoint[0] = Float.NaN
                                        message = "Для кисти используй один палец."
                                    } else {
                                        val action = event.actionMasked
                                        if (action == MotionEvent.ACTION_DOWN) {
                                            traceRays.clear()
                                            previousScreenPoint[0] = Float.NaN
                                        }
                                        if (action == MotionEvent.ACTION_DOWN ||
                                            action == MotionEvent.ACTION_MOVE ||
                                            action == MotionEvent.ACTION_UP) {
                                            val x = event.x
                                            val y = event.y
                                            val dx = x - previousScreenPoint[0]
                                            val dy = y - previousScreenPoint[1]
                                            val take = previousScreenPoint[0].isNaN() ||
                                                dx * dx + dy * dy >= 22f * 22f ||
                                                action == MotionEvent.ACTION_UP
                                            if (take) {
                                                @Suppress("DEPRECATION")
                                                val ray = touchCamera.screenPointToRay(x, y)
                                                val origin = ray.getPoint(0f)
                                                val far = ray.getPoint(1f)
                                                val a = model.getLocalPosition(Position(origin.x, origin.y, origin.z))
                                                val b = model.getLocalPosition(Position(far.x, far.y, far.z))
                                                val item = SurfaceRay(a.x, a.y, a.z,
                                                    b.x - a.x, b.y - a.y, b.z - a.z)
                                                if (traceRays.size < 12) traceRays.add(item)
                                                else if (action == MotionEvent.ACTION_UP) {
                                                    traceRays[traceRays.lastIndex] = item
                                                }
                                                previousScreenPoint[0] = x
                                                previousScreenPoint[1] = y
                                            }
                                        }
                                        if (action == MotionEvent.ACTION_CANCEL) {
                                            traceRays.clear()
                                            isPickingBrushCenter = false
                                            showLayers = true
                                        }
                                        if (action == MotionEvent.ACTION_UP) {
                                            val samples = traceRays.toList()
                                            traceRays.clear()
                                            val sampleRequest = requestId
                                            val sampleLocation = modelLocation
                                            val selected = selectedPartId
                                            val allVisible = visibleMaterials.toSet()
                                            val draft = sculptDraft
                                            isPickingBrushCenter = false
                                            pickingBusy = true
                                            scope.launch {
                                                try {
                                                    val found = withContext(Dispatchers.Default) {
                                                        samples.mapNotNull { ray ->
                                                            if (selected == null) null
                                                            else {
                                                                val hit = picker.pick(ray, selected, allVisible)
                                                                val originalBounds = materialBounds[selected]
                                                                if (hit == null || originalBounds == null) null
                                                                else originalBounds.at(hit.x, hit.y, hit.z)?.let {
                                                                    hit.copy(center = it)
                                                                }
                                                            }
                                                        }
                                                    }
                                                    if (sampleRequest != requestId ||
                                                        sampleLocation != modelLocation ||
                                                        selectedPartId != selected ||
                                                        visibleMaterials != allVisible) return@launch
                                                    if (found.isNotEmpty() && selected != null) {
                                                        suggestedStrokes = found.map { hit ->
                                                            draft.copy(materialId = selected,
                                                                centerX = hit.center.x,
                                                                centerY = hit.center.y,
                                                                centerZ = hit.center.z)
                                                        }.take(20 - sculptHistory.current.size)
                                                        val first = found.first().center
                                                        sculptDraft = sculptDraft.copy(
                                                            centerX = first.x, centerY = first.y,
                                                            centerZ = first.z
                                                        )
                                                        message = "Найдено точек на поверхности: ${suggestedStrokes.size}. Подтверди применение."
                                                    } else {
                                                        suggestedStrokes = emptyList()
                                                        message = "Нет пересечения с выбранным видимым материалом. Поверни модель или скрой перекрывающий слой."
                                                    }
                                                } catch (error: Exception) {
                                                    if (sampleRequest == requestId &&
                                                        sampleLocation == modelLocation) {
                                                        suggestedStrokes = emptyList()
                                                        message = error.message ?: "Не удалось определить поверхность."
                                                    }
                                                } finally {
                                                    if (sampleRequest == requestId &&
                                                        sampleLocation == modelLocation) {
                                                        pickingBusy = false
                                                        showLayers = true
                                                        sculptMode = true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    true
                                }
                            }
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
                                        autoAnimate = false,
                                        apply = {
                                            modelForPicking = this
                                            nodeLocation = modelLocation
                                        }
                                    )
                                }
                            }
                        }
                    }
                }

                if (isPickingBrushCenter) {
                    Surface(
                        modifier = Modifier.align(Alignment.BottomCenter).padding(14.dp),
                        color = Color(0xEE252434),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Row(
                            Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text("Нажми на область модели", color = TextPrimary,
                                style = MaterialTheme.typography.labelMedium,
                                modifier = Modifier.weight(1f, fill = false))
                            TextButton(onClick = {
                                isPickingBrushCenter = false
                                showLayers = true
                            }) { Text("Отмена") }
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
                    if (busy || layerBusy || pickingBusy) {
                        CircularProgressIndicator(Modifier.align(Alignment.Center))
                    }
                }
            }

            if (materialLayers.isNotEmpty() && modelLocation != null) {
                Row(
                    modifier = Modifier.fillMaxWidth().background(PanelTone)
                        .padding(horizontal = 14.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Слоёв: ${layerHistory.current.size}/${materialLayers.size} · Форма: ${sculptStrokes.size}",
                        style = MaterialTheme.typography.labelSmall, color = TextSecondary,
                        modifier = Modifier.weight(1f))
                    TextButton(onClick = { showLayers = true }) { Text("Управлять слоями") }
                }
            }

            if (autosaveProblem != null) {
                Text("Автосохранение: $autosaveProblem",
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall, color = Color(0xFFFFB4A2))
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
                        Modifier.fillMaxWidth().fillMaxHeight(0.88f)
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 18.dp, vertical = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Слои модели", style = MaterialTheme.typography.titleLarge)
                        Text("Выбери материал для точного перемещения, поворота и масштаба его частей.",
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
                        Column(Modifier.fillMaxWidth()) {
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
                                        onClick = { layerHistory = layerHistory.change(setOf(layer.id)) },
                                        contentPadding = PaddingValues(horizontal = 5.dp)
                                    ) { Text("Соло") }
                                    TextButton(
                                        onClick = { selectedPartId = layer.id },
                                        contentPadding = PaddingValues(horizontal = 5.dp)
                                    ) { Text("Править") }
                                }
                            }
                        }
                        val selectedPart = selectedPartId?.let { id ->
                            materialLayers.firstOrNull { it.id == id }
                        }
                        if (selectedPart != null) {
                            val currentPart = partHistory.current[selectedPart.id] ?: PartEdit()
                            val partId = selectedPart.id
                            HorizontalDivider(color = Color(0xFF3E4050))
                            Text("Редактирование: ${selectedPart.name}",
                                style = MaterialTheme.typography.titleMedium,
                                maxLines = 2)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (sculptMode) {
                                    Button(onClick = { sculptMode = false }) { Text("Положение") }
                                    OutlinedButton(onClick = { sculptMode = true }) { Text("Форма") }
                                } else {
                                    OutlinedButton(onClick = { sculptMode = false }) { Text("Положение") }
                                    Button(onClick = { sculptMode = true }) { Text("Форма") }
                                }
                            }
                            if (!sculptMode) {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                OutlinedButton(
                                    enabled = partHistory.canUndo,
                                    onClick = { partHistory = partHistory.undo() }
                                ) { Text("↶ Правка") }
                                OutlinedButton(
                                    enabled = partHistory.canRedo,
                                    onClick = { partHistory = partHistory.redo() }
                                ) { Text("↷ Правка") }
                                TextButton(onClick = {
                                    partHistory = partHistory.change(partId, PartEdit())
                                }) { Text("Сброс") }
                            }
                            Column(Modifier.fillMaxWidth()) {
                                Stepper("X", "%.2f".format(java.util.Locale.US, currentPart.x),
                                    { partHistory = partHistory.change(partId, currentPart.copy(x = (currentPart.x - .02f).coerceAtLeast(-3f))) },
                                    { partHistory = partHistory.change(partId, currentPart.copy(x = (currentPart.x + .02f).coerceAtMost(3f))) })
                                Stepper("Y", "%.2f".format(java.util.Locale.US, currentPart.y),
                                    { partHistory = partHistory.change(partId, currentPart.copy(y = (currentPart.y - .02f).coerceAtLeast(-3f))) },
                                    { partHistory = partHistory.change(partId, currentPart.copy(y = (currentPart.y + .02f).coerceAtMost(3f))) })
                                Stepper("Z", "%.2f".format(java.util.Locale.US, currentPart.z),
                                    { partHistory = partHistory.change(partId, currentPart.copy(z = (currentPart.z - .02f).coerceAtLeast(-3f))) },
                                    { partHistory = partHistory.change(partId, currentPart.copy(z = (currentPart.z + .02f).coerceAtMost(3f))) })
                                Stepper("Y °", "${currentPart.rotationY}°",
                                    { partHistory = partHistory.change(partId, currentPart.copy(rotationY = (currentPart.rotationY - 5).coerceAtLeast(-360))) },
                                    { partHistory = partHistory.change(partId, currentPart.copy(rotationY = (currentPart.rotationY + 5).coerceAtMost(360))) })
                                Stepper("Размер", "${currentPart.scalePercent}%",
                                    { partHistory = partHistory.change(partId, currentPart.copy(scalePercent = (currentPart.scalePercent - 5).coerceAtLeast(25))) },
                                    { partHistory = partHistory.change(partId, currentPart.copy(scalePercent = (currentPart.scalePercent + 5).coerceAtMost(300))) })
                            }
                            Text(
                                "Это изменение целой группы по материалу, а не кисть по вершинам.",
                                style = MaterialTheme.typography.labelSmall, color = TextSecondary
                            )
                            } else {
                                val brush = sculptDraft.copy(materialId = partId)
                                Text("Локальная деформация вершин",
                                    style = MaterialTheme.typography.titleSmall)
                                Button(
                                    enabled = !layerBusy && !pickingBusy &&
                                        surfacePicker?.materialIds?.contains(partId) == true &&
                                        pickerLocation == modelLocation &&
                                        nodeLocation == modelLocation &&
                                        partId in visibleMaterials &&
                                        partEdits.isEmpty(),
                                    onClick = {
                                        suggestedStrokes = emptyList()
                                        isPickingBrushCenter = true
                                        showLayers = false
                                    },
                                    modifier = Modifier.fillMaxWidth()
                                ) { Text("Точная кисть: касание или путь") }
                                if (surfacePicker == null) {
                                    Text("Точная кисть загружается или не поддерживает эту сцену. Ручной ввод работает.",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = TextSecondary)
                                }
                                Text("Центр — проценты от границ выбранного материала. Измени параметры и нажми «Применить».",
                                    style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                                Column(Modifier.fillMaxWidth()) {
                                    Stepper("Центр X", "${brush.centerX}%",
                                        { sculptDraft = sculptDraft.copy(centerX = (sculptDraft.centerX-5).coerceAtLeast(0)) },
                                        { sculptDraft = sculptDraft.copy(centerX = (sculptDraft.centerX+5).coerceAtMost(100)) })
                                    Stepper("Центр Y", "${brush.centerY}%",
                                        { sculptDraft = sculptDraft.copy(centerY = (sculptDraft.centerY-5).coerceAtLeast(0)) },
                                        { sculptDraft = sculptDraft.copy(centerY = (sculptDraft.centerY+5).coerceAtMost(100)) })
                                    Stepper("Центр Z", "${brush.centerZ}%",
                                        { sculptDraft = sculptDraft.copy(centerZ = (sculptDraft.centerZ-5).coerceAtLeast(0)) },
                                        { sculptDraft = sculptDraft.copy(centerZ = (sculptDraft.centerZ+5).coerceAtMost(100)) })
                                    Stepper("Радиус", "${brush.radius}%",
                                        { sculptDraft = sculptDraft.copy(radius = (sculptDraft.radius-5).coerceAtLeast(5)) },
                                        { sculptDraft = sculptDraft.copy(radius = (sculptDraft.radius+5).coerceAtMost(100)) })
                                    Stepper("Сила", "${brush.strength}%",
                                        { sculptDraft = sculptDraft.copy(strength = (sculptDraft.strength-1).coerceAtLeast(1)) },
                                        { sculptDraft = sculptDraft.copy(strength = (sculptDraft.strength+1).coerceAtMost(20)) })
                                    Row(Modifier.horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        listOf(1 to "+X", -1 to "−X", 2 to "+Y", -2 to "−Y",
                                            3 to "+Z", -3 to "−Z").forEach { (axis, label) ->
                                            if (brush.axis == axis) {
                                                Button(onClick = { sculptDraft = sculptDraft.copy(axis=axis) },
                                                    contentPadding=PaddingValues(horizontal=10.dp)) { Text(label) }
                                            } else {
                                                OutlinedButton(onClick = { sculptDraft = sculptDraft.copy(axis=axis) },
                                                    contentPadding=PaddingValues(horizontal=10.dp)) { Text(label) }
                                            }
                                        }
                                    }
                                }
                                if (suggestedStrokes.isNotEmpty() &&
                                    suggestedStrokes.first().materialId == partId) {
                                    Text("Путь: ${suggestedStrokes.size} точек. Сила и радиус взяты на момент касания.",
                                        style = MaterialTheme.typography.bodySmall, color = Highlight)
                                    TextButton(onClick = { suggestedStrokes = emptyList() }) {
                                        Text("Очистить путь")
                                    }
                                }
                                Text("Деформаций: ${sculptHistory.current.size}/20",
                                    style = MaterialTheme.typography.labelMedium)
                                Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                                    OutlinedButton(enabled=sculptHistory.canUndo,
                                        onClick={sculptHistory=sculptHistory.undo()}) { Text("↶") }
                                    OutlinedButton(enabled=sculptHistory.canRedo,
                                        onClick={sculptHistory=sculptHistory.redo()}) { Text("↷") }
                                    TextButton(enabled=sculptHistory.current.isNotEmpty(),
                                        onClick={sculptHistory=sculptHistory.reset()}) { Text("Сброс") }
                                }
                                Button(
                                    modifier=Modifier.fillMaxWidth(),
                                    enabled = !layerBusy && !pickingBusy &&
                                        sculptHistory.current.size < 20,
                                    onClick = {
                                        try {
                                            val path = suggestedStrokes.takeIf {
                                                it.isNotEmpty() && it.first().materialId == partId
                                            } ?: listOf(brush)
                                            if (path.size + sculptHistory.current.size > 20)
                                                throw java.io.IOException("Не хватает лимита деформаций. Отмени или сохрани GLB.")
                                            sculptHistory = sculptHistory.addPath(path)
                                            suggestedStrokes = emptyList()
                                        } catch (e: Exception) {
                                            message = e.message ?: "Ошибка изменения формы."
                                        }
                                    }
                                ) { Text(if (suggestedStrokes.isNotEmpty()) "Применить путь" else "Применить деформацию") }
                            }
                        }
                        Text("При сохранении учитываются видимость и правки частей. Исходный GLB не изменяется.",
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
