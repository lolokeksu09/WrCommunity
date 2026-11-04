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
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
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
    var vertexHistory by remember { mutableStateOf(VertexHistory()) }
    var vertexMode by remember { mutableStateOf(false) }
    var vertexTargets by remember { mutableStateOf<List<VertexPrimitive>>(emptyList()) }
    var vertexTargetsError by remember { mutableStateOf<String?>(null) }
    var vertexSurfacePicker by remember { mutableStateOf<GlbSurfacePicker?>(null) }
    var vertexPickerError by remember { mutableStateOf<String?>(null) }
    var isPickingVertex by remember { mutableStateOf(false) }
    var activeVertex by remember { mutableStateOf<SurfaceVertexHit?>(null) }
    var selectedVertexGroup by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var additiveVertexPicking by remember { mutableStateOf(false) }
    var vertexGroupBusy by remember { mutableStateOf(false) }
    // One active 3D axis-drag gesture; the GLB changes only on ACTION_UP.
    var vertexDragAxis by remember { mutableIntStateOf(-1) }
    var vertexDragSession by remember { mutableStateOf<VertexAxisDrag?>(null) }
    var vertexDragPreview by remember { mutableStateOf(0f) }
    var vertexDragSource by remember { mutableStateOf<String?>(null) }
    var vertexDragSelected by remember { mutableStateOf<SurfaceVertexHit?>(null) }
    var vertexDragGroup by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var vertexPrimitiveIndex by remember { mutableIntStateOf(0) }
    var vertexIndex by remember { mutableIntStateOf(0) }
    var vertexIndexInput by remember { mutableStateOf("0") }
    var vertexStep by remember { mutableStateOf(0.01f) }
    var sculptDraft by remember { mutableStateOf(SculptStroke(materialId = 0)) }
    var symmetryAxis by remember { mutableIntStateOf(0) }
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
    var showProjects by remember { mutableStateOf(false) }
    var projectList by remember { mutableStateOf<List<SavedEditorProject>>(emptyList()) }
    var projectListError by remember { mutableStateOf<String?>(null) }
    var projectToDelete by remember { mutableStateOf<SavedEditorProject?>(null) }
    var projectActionsMenu by remember { mutableStateOf<String?>(null) }
    var projectToRename by remember { mutableStateOf<SavedEditorProject?>(null) }
    var projectToDuplicate by remember { mutableStateOf<SavedEditorProject?>(null) }
    var projectTitleInput by remember { mutableStateOf("") }
    var modelReport by remember { mutableStateOf<GlbModelReport?>(null) }
    var modelReportError by remember { mutableStateOf<String?>(null) }
    var confirmModelReplacement by remember { mutableStateOf(false) }
    var confirmArchiveImport by remember { mutableStateOf(false) }
    var confirmCheckpointRestore by remember { mutableStateOf(false) }
    var checkpointAvailable by remember { mutableStateOf(false) }
    var referenceUri by remember { mutableStateOf<Uri?>(null) }
    var showReference by remember { mutableStateOf(true) }
    val edit = history.current
    val visibleMaterials = layerHistory.current
    val partEdits = partHistory.current
    val sculptStrokes = sculptHistory.current
    val vertexMoves = vertexHistory.current
    val hasModelEdits = !edit.isIdentity ||
        visibleMaterials != materialLayers.map { it.id }.toSet() ||
        partEdits.isNotEmpty() || sculptStrokes.isNotEmpty() ||
        vertexMoves.isNotEmpty()

    // Flush the current edit immediately when Android backgrounds the editor.
    // The background worker survives destruction of this Compose screen.
    val pauseDraft = if (recoveryReady) savedSource?.let { source ->
        EditorDraft(
            source = source, name = modelName, global = edit,
            visible = visibleMaterials, parts = partEdits,
            strokes = sculptStrokes, selected = selectedPartId,
            brush = sculptDraft, camera = cameraView.name,
            symmetryAxis = symmetryAxis, vertexMoves = vertexMoves
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

    // A small bounded JSON probe, never a second full GLB/BIN read on the UI.
    // LaunchedEffect cancels obsolete analysis when the user switches models.
    LaunchedEffect(savedSource) {
        val source = savedSource
        modelReport = null
        modelReportError = null
        if (source != null) {
            try {
                modelReport = withContext(Dispatchers.IO) {
                    GlbModelInspector.inspect(source.file)
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                modelReportError = error.message ?: "Невозможно прочитать параметры GLB."
            }
        }
    }

    LaunchedEffect(showProjects, savedSource) {
        if (!showProjects) return@LaunchedEffect
        try {
            projectList = EditorSessionStore.listProjects(context.applicationContext.filesDir)
            projectListError = null
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            projectListError = e.message ?: "Не удалось открыть список проектов."
        }
    }

    // Choose a mesh primitive and an exact POSITION index, not an imprecise
    // screen-space guess. The list reads only glTF JSON, not the whole BIN.
    LaunchedEffect(savedSource) {
        vertexTargets = emptyList()
        vertexTargetsError = null
        vertexPrimitiveIndex = 0
        vertexIndex = 0
        vertexIndexInput = "0"
        activeVertex = null
        selectedVertexGroup = emptySet()
        additiveVertexPicking = false
        isPickingVertex = false
        vertexDragAxis = -1
        vertexDragSession = null
        vertexDragPreview = 0f
        vertexDragSource = null
        vertexDragSelected = null
        vertexDragGroup = emptySet()
        val source = savedSource ?: return@LaunchedEffect
        try {
            vertexTargets = withContext(Dispatchers.IO) {
                GlbVertexEditor.targets(source.file)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            vertexTargetsError = error.message ?: "Не удалось прочитать вершины модели."
        }
    }

    // Restore the last unfinished edit from app-private persistent storage.
    // All expensive file reading and checksum work runs off the UI thread.
    LaunchedEffect(Unit) {
        busy = true
        try {
            val restored = EditorSessionStore.restoreWithStatus(context.applicationContext.filesDir)
            val draft = restored?.draft
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
                vertexHistory = VertexHistory(states = listOf(draft.vertexMoves))
                history = EditHistory(steps = listOf(draft.global))
                sculptDraft = draft.brush
                symmetryAxis = draft.symmetryAxis
                selectedPartId = draft.selected?.takeIf { it in available }
                cameraView = CameraView.entries.firstOrNull { it.name == draft.camera }
                    ?: CameraView.FRONT
                cameraEpoch++
                modelName = draft.name
                originalLocation = location
                modelLocation = location
                savedSource = draft.source
                message = when {
                    restored.fromCheckpoint ->
                        "Авточерновики повреждены. Восстановлена ручная контрольная точка; последние изменения могли быть потеряны."
                    restored.fromBackup ->
                        "Основной черновик повреждён. Восстановлена резервная версия; последние правки могли не сохраниться. Для надёжного хранения экспортируйте GLB."
                    else -> "Черновик восстановлен. Правки на месте."
                }
            }
        } catch (e: Exception) {
            message = e.message?.let { "Не удалось восстановить черновик: $it" }
                ?: "Не удалось восстановить черновик."
        } finally {
            checkpointAvailable = runCatching {
                EditorSessionStore.readCheckpoint(context.applicationContext.filesDir) != null
            }.getOrDefault(false)
            recoveryReady = true
            busy = false
        }
    }

    // Autosave lightweight edit metadata, not 150 MB of geometry on each touch.
    // Restart the debounce when any displayed edit changes; canceled writes must
    // not replace a newer manifest.
    LaunchedEffect(recoveryReady, savedSource, modelName, history.current,
        layerHistory.current, partHistory.current, sculptHistory.current,
        vertexHistory.current, selectedPartId, sculptDraft, cameraView, symmetryAxis) {
        val source = savedSource
        if (!recoveryReady || source == null) return@LaunchedEffect
        kotlinx.coroutines.delay(600)
        val snapshot = EditorDraft(
            source = source, name = modelName, global = history.current,
            visible = layerHistory.current, parts = partHistory.current,
            strokes = sculptHistory.current, selected = selectedPartId,
            brush = sculptDraft, camera = cameraView.name,
            symmetryAxis = symmetryAxis, vertexMoves = vertexHistory.current
        )
        try {
            EditorSessionStore.saveCurrent(context.applicationContext.filesDir, snapshot)
            autosaveProblem = null
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            autosaveProblem = e.message ?: "Ошибка автосохранения."
        }
    }

    // A change in layer visibility creates an independent preview GLB.
    // Cancellation prevents stale previews overwriting newer selections.
    LaunchedEffect(originalLocation, visibleMaterials, partEdits, sculptStrokes, vertexMoves) {
        val origin = originalLocation ?: return@LaunchedEffect
        val allIds = materialLayers.map { it.id }.toSet()
        if (visibleMaterials == allIds && partEdits.isEmpty() &&
            sculptStrokes.isEmpty() && vertexMoves.isEmpty()) {
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
                sculptStrokes.filter { it.materialId in visibleMaterials },
                vertexMoves
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

    // The display preview filters hidden primitives, which changes primitive
    // indices. Build vertex selection from the ORIGINAL unfiltered mesh with
    // its live vertex/sculpt changes so hits retain stable source IDs.
    LaunchedEffect(originalLocation, vertexMoves, sculptStrokes, partEdits) {
        vertexSurfacePicker = null
        vertexPickerError = null
        val origin = originalLocation ?: return@LaunchedEffect
        if (partEdits.isNotEmpty()) {
            vertexPickerError = "Для выбора вершины касанием сбрось изменения положения частей."
            return@LaunchedEffect
        }
        try {
            val picker = withContext(Dispatchers.Default) {
                val path = Uri.parse(origin).path
                    ?: throw java.io.IOException("Исходная модель недоступна.")
                val original = File(path).readBytes()
                val withVertices = GlbVertexEditor.apply(original, vertexMoves)
                val shaped = GlbSculpt.apply(withVertices, sculptStrokes)
                GlbSurfacePicker.fromBytes(shaped)
            }
            vertexSurfacePicker = picker
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            vertexPickerError = error.message ?: "Эта сцена не поддерживает точный выбор вершин."
        }
    }

    // A geometry/scene switch cancels any pending drag before a stale pointer
    // event can apply a move to a different model.
    LaunchedEffect(modelLocation, partEdits, savedSource) {
        vertexDragAxis = -1
        vertexDragSession = null
        vertexDragPreview = 0f
        vertexDragSource = null
        vertexDragSelected = null
        vertexDragGroup = emptySet()
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
            val outgoing = pauseDraft
            job = scope.launch {
                busy = true
                message = null
                var stagedSource: StoredModel? = null
                var importedCommitted = false
                try {
                    val loaded = GlbFileImporter.import(context.applicationContext, uri)
                    val imported = File(Uri.parse(loaded.fileLocation).path
                        ?: throw java.io.IOException("GLB недоступен после импорта."))
                    val stored = EditorSessionStore.importSource(
                        context.applicationContext.filesDir, imported)
                    stagedSource = stored
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
                        // Flush edits that may still be waiting for the debounce
                        // before moving to a different saved project.
                        outgoing?.let {
                            EditorSessionStore.saveCurrent(context.applicationContext.filesDir, it)
                        }
                        // Commit metadata before displaying the new project. An
                        // interrupted import must not replace the last good draft.
                        val committedDraft = EditorSessionStore.commitImportedDraft(
                            context.applicationContext.filesDir, stored,
                            displayName(context.contentResolver, uri) ?: "Модель GLB",
                            groups.map { it.id }.toSet()
                        )
                        importedCommitted = true
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
                        vertexHistory = VertexHistory()
                        vertexMode = false
                        sculptDraft = committedDraft.brush
                        symmetryAxis = 0
                        sculptMode = false
                        selectedPartId = null
                        originalLocation = persistentLocation
                        modelLocation = persistentLocation
                        savedSource = stored
                        checkpointAvailable = false
                        autosaveProblem = null
                        modelName = committedDraft.name
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
                    if (!importedCommitted) stagedSource?.let { pending ->
                        // Cancellation must still clean this private, uncommitted
                        // copy. Referenced drafts are protected by store checks.
                        withContext(NonCancellable) {
                            try {
                                EditorSessionStore.discardUncommittedSource(
                                    context.applicationContext.filesDir, pending)
                            } catch (_: Exception) {
                                // Preserve the last committed model on cleanup errors.
                            }
                        }
                    }
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
            val vertexSnapshot = vertexHistory.current
            scope.launch {
                busy = true
                try {
                    GlbTransformExporter.export(
                        context.applicationContext, location, uri, snapshot,
                        selectedMaterials.takeIf { materialLayers.isNotEmpty() },
                        partsSnapshot, sculptSnapshot, vertexSnapshot
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
    val archiveImportPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            job?.cancel()
            val request = ++requestId
            val outgoing = pauseDraft
            job = scope.launch {
                busy = true
                recoveryReady = false // Inhibit stale edit snapshots while switching.
                message = null
                try {
                    outgoing?.let {
                        EditorSessionStore.saveCurrent(context.applicationContext.filesDir, it)
                    }
                    val stream = context.contentResolver.openInputStream(uri)
                        ?: throw java.io.IOException("Не удалось открыть архив проекта.")
                    val draft = EditorProjectArchive.importProject(
                        context.applicationContext.filesDir, stream)
                    if (request == requestId) {
                        val location = Uri.fromFile(draft.source.file).toString()
                        val groups = GlbLayers.describe(context.applicationContext, location)
                        val bounds = withContext(Dispatchers.IO) {
                            runCatching { GlbBrushTarget.fromFile(draft.source.file) }
                                .getOrDefault(emptyMap())
                        }
                        materialBounds = bounds
                        materialLayers = groups
                        layerHistory = LayerHistory(states = listOf(draft.visible))
                        partHistory = PartHistory(steps = listOf(draft.parts))
                        sculptHistory = SculptHistory(states = listOf(draft.strokes))
                        vertexHistory = VertexHistory(states = listOf(draft.vertexMoves))
                        vertexMode = false
                        history = EditHistory(steps = listOf(draft.global))
                        sculptDraft = draft.brush
                        symmetryAxis = draft.symmetryAxis
                        selectedPartId = draft.selected
                        cameraView = CameraView.entries.firstOrNull { it.name == draft.camera }
                            ?: CameraView.FRONT
                        cameraEpoch++
                        savedSource = draft.source
                        modelName = draft.name
                        originalLocation = location
                        modelLocation = location
                        checkpointAvailable = false
                        autosaveProblem = null
                        sculptMode = false
                        showLayers = false
                        isPickingBrushCenter = false
                        suggestedStrokes = emptyList()
                        surfacePicker = null
                        pickerLocation = null
                        nodeLocation = null
                        modelForPicking = null
                        message = "Проект из ZIP восстановлен. Исходный архив не изменён."
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    if (request == requestId)
                        message = error.message ?: "Не удалось восстановить архив проекта."
                } finally {
                    if (request == requestId) {
                        recoveryReady = true
                        busy = false
                    }
                }
            }
        }
    }
    val archiveExportPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/zip")
    ) { uri ->
        val snapshot = pauseDraft
        if (uri != null && snapshot != null) {
            scope.launch {
                busy = true
                try {
                    withContext(Dispatchers.IO) {
                        val resolver = context.contentResolver
                        val sha = java.security.MessageDigest.getInstance("SHA-256")
                        val stream = resolver.openOutputStream(uri, "wt")
                            ?: throw java.io.IOException("Не удалось создать архив.")
                        EditorProjectArchive.write(
                            java.security.DigestOutputStream(stream, sha), snapshot)
                        val expected = sha.digest()
                        val actual = java.security.MessageDigest.getInstance("SHA-256")
                        val readBack = resolver.openInputStream(uri)
                            ?: throw java.io.IOException("Нельзя проверить записанный ZIP.")
                        readBack.use { input ->
                            val block = ByteArray(65536)
                            var total = 0L
                            while (true) {
                                currentCoroutineContext().ensureActive()
                                val count = input.read(block)
                                if (count < 0) break
                                if (count == 0) continue
                                total += count
                                if (total > GlbHeader.MAX_BYTES + 2L * 1024 * 1024)
                                    throw java.io.IOException("ZIP превышает ограничение.")
                                actual.update(block, 0, count)
                            }
                        }
                        if (!java.security.MessageDigest.isEqual(expected, actual.digest()))
                            throw java.io.IOException("Записанный ZIP повреждён или неполный.")
                    }
                    message = "Резервный ZIP проекта сохранён и проверен."
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    message = error.message ?: "Не удалось сохранить архив проекта."
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
        if (confirmModelReplacement) {
            AlertDialog(
                onDismissRequest = { confirmModelReplacement = false },
                title = { Text("Заменить текущий проект?") },
                text = {
                    Text("Текущие правки будут сохранены в библиотеке проектов перед открытием другого GLB. При необходимости сначала сделай экспорт ZIP для отдельной резервной копии.")
                },
                confirmButton = {
                    TextButton(onClick = {
                        confirmModelReplacement = false
                        importPicker.launch(arrayOf("*/*"))
                    }) { Text("Выбрать другой GLB") }
                },
                dismissButton = {
                    TextButton(onClick = { confirmModelReplacement = false }) {
                        Text("Отмена")
                    }
                }
            )
        }
        projectToRename?.let { project ->
            AlertDialog(
                onDismissRequest = { projectToRename = null },
                title = { Text("Переименовать проект") },
                text = {
                    OutlinedTextField(
                        value = projectTitleInput,
                        onValueChange = { projectTitleInput = it },
                        label = { Text("Название проекта") },
                        singleLine = true
                    )
                },
                confirmButton = {
                    TextButton(
                        enabled = !busy && projectTitleInput.trim().isNotEmpty() &&
                            projectTitleInput.trim().length <= 160,
                        onClick = {
                            val name = projectTitleInput
                            val sourceId = project.sourceFileName
                            val outgoing = if (project.active) pauseDraft else null
                            projectToRename = null
                            scope.launch {
                                busy = true
                                try {
                                    outgoing?.let {
                                        EditorSessionStore.saveCurrent(
                                            context.applicationContext.filesDir, it)
                                    }
                                    val result = EditorSessionStore.renameProject(
                                        context.applicationContext.filesDir, sourceId, name)
                                    if (project.active) modelName = result.name
                                    projectList = EditorSessionStore.listProjects(
                                        context.applicationContext.filesDir)
                                    projectListError = null
                                    message = "Проект переименован: ${result.name}."
                                } catch (cancelled: CancellationException) {
                                    throw cancelled
                                } catch (error: Exception) {
                                    projectListError = error.message ?: "Не удалось изменить название."
                                } finally {
                                    busy = false
                                }
                            }
                        }
                    ) { Text("Сохранить") }
                },
                dismissButton = {
                    TextButton(onClick = { projectToRename = null }) { Text("Отмена") }
                }
            )
        }
        projectToDuplicate?.let { project ->
            AlertDialog(
                onDismissRequest = { projectToDuplicate = null },
                title = { Text("Создать независимую копию?") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Исходный GLB и все правки будут скопированы в новый проект. Текущий останется неизменным. Это потребует до " +
                            String.format(java.util.Locale.ROOT, "%.1f МиБ", project.bytes / 1048576.0) +
                            " дополнительного места.")
                        OutlinedTextField(
                            value = projectTitleInput,
                            onValueChange = { projectTitleInput = it },
                            label = { Text("Название копии") },
                            singleLine = true
                        )
                    }
                },
                confirmButton = {
                    TextButton(
                        enabled = !busy && !project.damaged &&
                            projectTitleInput.trim().isNotEmpty() &&
                            projectTitleInput.trim().length <= 160,
                        onClick = {
                            val name = projectTitleInput
                            val sourceId = project.sourceFileName
                            val outgoing = if (project.active) pauseDraft else null
                            projectToDuplicate = null
                            scope.launch {
                                busy = true
                                try {
                                    outgoing?.let {
                                        EditorSessionStore.saveCurrent(
                                            context.applicationContext.filesDir, it)
                                    }
                                    val copy = EditorSessionStore.duplicateProject(
                                        context.applicationContext.filesDir, sourceId, name)
                                    projectList = EditorSessionStore.listProjects(
                                        context.applicationContext.filesDir)
                                    projectListError = null
                                    message = "Копия «${copy.name}» создана. Открой её в списке проектов."
                                } catch (cancelled: CancellationException) {
                                    throw cancelled
                                } catch (error: Exception) {
                                    projectListError = error.message ?: "Не удалось скопировать проект."
                                } finally {
                                    busy = false
                                }
                            }
                        }
                    ) { Text("Создать копию") }
                },
                dismissButton = {
                    TextButton(onClick = { projectToDuplicate = null }) { Text("Отмена") }
                }
            )
        }
        projectToDelete?.let { project ->
            AlertDialog(
                onDismissRequest = { projectToDelete = null },
                title = { Text("Удалить сохранённый проект?") },
                text = {
                    Text("Проект «${project.name}» и его приватная GLB-копия будут удалены из приложения. Отменить это нельзя. Исходный файл в «Загрузках» не затрагивается.")
                },
                confirmButton = {
                    TextButton(onClick = {
                        projectToDelete = null
                        scope.launch {
                            busy = true
                            try {
                                EditorSessionStore.deleteProject(
                                    context.applicationContext.filesDir, project.sourceFileName)
                                projectList = EditorSessionStore.listProjects(
                                    context.applicationContext.filesDir)
                                projectListError = null
                            } catch (e: Exception) {
                                projectListError = e.message ?: "Не удалось удалить проект."
                            } finally {
                                busy = false
                            }
                        }
                    }) { Text("Удалить") }
                },
                dismissButton = {
                    TextButton(onClick = { projectToDelete = null }) { Text("Отмена") }
                }
            )
        }
        if (confirmArchiveImport) {
            AlertDialog(
                onDismissRequest = { confirmArchiveImport = false },
                title = { Text("Открыть проект из ZIP?") },
                text = {
                    Text("Текущий проект и его контрольная точка будут заменены после полной проверки ZIP. Перед этим сохрани резервную копию, если правки важны.")
                },
                confirmButton = {
                    TextButton(onClick = {
                        confirmArchiveImport = false
                        archiveImportPicker.launch(arrayOf("application/zip", "application/octet-stream"))
                    }) { Text("Выбрать ZIP") }
                },
                dismissButton = {
                    TextButton(onClick = { confirmArchiveImport = false }) { Text("Отмена") }
                }
            )
        }
        if (confirmCheckpointRestore) {
            AlertDialog(
                onDismissRequest = { confirmCheckpointRestore = false },
                title = { Text("Вернуть контрольную точку?") },
                text = {
                    Text("Текущие правки будут заменены ручным снимком. Этот откат нельзя отменить через историю Undo. Сначала экспортируй GLB, если нужно сохранить текущий результат.")
                },
                confirmButton = {
                    TextButton(onClick = {
                        confirmCheckpointRestore = false
                        scope.launch {
                            busy = true
                            try {
                                val checkpoint = EditorSessionStore.restoreCheckpoint(
                                    context.applicationContext.filesDir)
                                if (checkpoint.source != savedSource)
                                    throw java.io.IOException("Контрольная точка относится к другой модели.")
                                layerHistory = LayerHistory(states = listOf(checkpoint.visible))
                                partHistory = PartHistory(steps = listOf(checkpoint.parts))
                                sculptHistory = SculptHistory(states = listOf(checkpoint.strokes))
                                vertexHistory = VertexHistory(states = listOf(checkpoint.vertexMoves))
                                history = EditHistory(steps = listOf(checkpoint.global))
                                sculptDraft = checkpoint.brush
                                symmetryAxis = checkpoint.symmetryAxis
                                selectedPartId = checkpoint.selected
                                cameraView = CameraView.entries.firstOrNull {
                                    it.name == checkpoint.camera
                                } ?: CameraView.FRONT
                                cameraEpoch++
                                sculptMode = false
                                showLayers = false
                                isPickingBrushCenter = false
                                suggestedStrokes = emptyList()
                                // Keep the current picker until a preview or
                                // part edit change rebuilds it. Clearing it when
                                // only the camera changes would disable touch
                                // selection with no LaunchedEffect restart.
                                modelLocation = originalLocation
                                autosaveProblem = null
                                message = "Контрольная точка восстановлена."
                            } catch (cancelled: CancellationException) {
                                throw cancelled
                            } catch (error: Exception) {
                                message = error.message ?: "Не удалось вернуть контрольную точку."
                            } finally {
                                busy = false
                            }
                        }
                    }) { Text("Вернуть") }
                },
                dismissButton = {
                    TextButton(onClick = { confirmCheckpointRestore = false }) {
                        Text("Отмена")
                    }
                }
            )
        }
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
                TextButton(
                    enabled = !busy && recoveryReady,
                    onClick = { showProjects = true }
                ) { Text("Мои") }
                FilledTonalButton(
                    onClick = {
                        if (savedSource != null && hasModelEdits) {
                            confirmModelReplacement = true
                        } else {
                            importPicker.launch(arrayOf("*/*"))
                        }
                    },
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
                                if (vertexDragAxis >= 0) {
                                    val selected = activeVertex
                                    val model = modelForPicking
                                    val picker = vertexSurfacePicker
                                    val anchor = selected?.let {
                                        picker?.vertexPosition(it.mesh, it.primitive, it.vertex)
                                    }
                                    if (selected == null || model == null || anchor == null ||
                                        !vertexMode || partEdits.isNotEmpty() ||
                                        !recoveryReady || busy || layerBusy || pickingBusy ||
                                        selectedPartId != selected.materialId ||
                                        selected.materialId !in visibleMaterials ||
                                        nodeLocation != modelLocation) {
                                        vertexDragAxis = -1
                                        vertexDragSession = null
                                        vertexDragPreview = 0f
                                        message = "Перемещение отменено: модель или выбранная вершина изменилась."
                                    } else if (event.pointerCount != 1 ||
                                        event.actionMasked == MotionEvent.ACTION_CANCEL) {
                                        vertexDragAxis = -1
                                        vertexDragSession = null
                                        vertexDragPreview = 0f
                                        message = "Осевой жест отменён."
                                    } else if (event.actionMasked == MotionEvent.ACTION_DOWN ||
                                        event.actionMasked == MotionEvent.ACTION_MOVE ||
                                        event.actionMasked == MotionEvent.ACTION_UP) {
                                        try {
                                            @Suppress("DEPRECATION")
                                            val ray = touchCamera.screenPointToRay(event.x, event.y)
                                            val near = ray.getPoint(0f)
                                            val far = ray.getPoint(1f)
                                            val a = model.getLocalPosition(
                                                Position(near.x, near.y, near.z))
                                            val b = model.getLocalPosition(
                                                Position(far.x, far.y, far.z))
                                            val local = SurfaceRay(a.x, a.y, a.z,
                                                b.x-a.x, b.y-a.y, b.z-a.z)
                                            when (event.actionMasked) {
                                                MotionEvent.ACTION_DOWN -> {
                                                    val started = VertexAxisDrag.begin(
                                                        anchor, vertexDragAxis, vertexStep, local)
                                                    if (started == null) {
                                                        vertexDragAxis = -1
                                                        vertexDragSession = null
                                                        message = "Ось почти совпадает с направлением камеры. Измени вид и попробуй ещё раз."
                                                    } else {
                                                        vertexDragSession = started
                                                        vertexDragSource = modelLocation
                                                        vertexDragSelected = selected
                                                        vertexDragPreview = 0f
                                                    }
                                                }
                                                MotionEvent.ACTION_MOVE -> {
                                                    val session = vertexDragSession
                                                    if (session != null &&
                                                        vertexDragSource == modelLocation &&
                                                        vertexDragSelected == selected) {
                                                        vertexDragPreview = session.delta(local)
                                                            ?: throw java.io.IOException(
                                                                "Невозможно измерить сдвиг из этого ракурса.")
                                                    }
                                                }
                                                MotionEvent.ACTION_UP -> {
                                                    val session = vertexDragSession
                                                    if (session != null &&
                                                        vertexDragSource == modelLocation &&
                                                        vertexDragSelected == selected) {
                                                        val move = session.move(
                                                            selected.mesh, selected.primitive,
                                                            selected.vertex, local)
                                                        if (move != null) {
                                                            vertexHistory = vertexHistory.add(move)
                                                            message = "Перемещение вершины сохранено одним шагом Undo."
                                                        } else {
                                                            message = "Сдвиг меньше выбранного шага — геометрия не изменена."
                                                        }
                                                    }
                                                    vertexDragAxis = -1
                                                    vertexDragSession = null
                                                    vertexDragPreview = 0f
                                                    vertexDragSelected = null
                                                    vertexDragSource = null
                                                }
                                            }
                                        } catch (error: Exception) {
                                            vertexDragAxis = -1
                                            vertexDragSession = null
                                            vertexDragPreview = 0f
                                            vertexDragSelected = null
                                            vertexDragSource = null
                                            message = error.message ?: "Ошибка осевого перемещения."
                                        }
                                    }
                                    true
                                } else if (isPickingVertex) {
                                    val model = modelForPicking
                                    val picker = vertexSurfacePicker
                                    val selected = selectedPartId
                                    if (model == null || picker == null || selected == null ||
                                        pickingBusy || layerBusy || partEdits.isNotEmpty() ||
                                        nodeLocation != modelLocation) {
                                        isPickingVertex = false
                                        showLayers = true
                                        message = "Выбор вершины недоступен. Проверь модель и видимость слоёв."
                                    } else if (event.pointerCount > 1) {
                                        isPickingVertex = false
                                        showLayers = true
                                        message = "Для выбора вершины используй одно касание."
                                    } else if (event.actionMasked == MotionEvent.ACTION_CANCEL) {
                                        isPickingVertex = false
                                        showLayers = true
                                    } else if (event.actionMasked == MotionEvent.ACTION_UP) {
                                        isPickingVertex = false
                                        pickingBusy = true
                                        val selectedMaterial = selected
                                        val allVisible = visibleMaterials.toSet()
                                        val chosenLocation = modelLocation
                                        val chosenSource = originalLocation
                                        val request = requestId
                                        try {
                                            @Suppress("DEPRECATION")
                                            val ray = touchCamera.screenPointToRay(event.x, event.y)
                                            val near = ray.getPoint(0f)
                                            val far = ray.getPoint(1f)
                                            val a = model.getLocalPosition(
                                                Position(near.x, near.y, near.z))
                                            val b = model.getLocalPosition(
                                                Position(far.x, far.y, far.z))
                                            val surfaceRay = SurfaceRay(
                                                a.x, a.y, a.z,
                                                b.x-a.x, b.y-a.y, b.z-a.z)
                                            scope.launch {
                                                try {
                                                    val hit = withContext(Dispatchers.Default) {
                                                        picker.pickVertex(surfaceRay, selectedMaterial, allVisible)
                                                    }
                                                    if (request != requestId ||
                                                        chosenLocation != modelLocation ||
                                                        chosenSource != originalLocation ||
                                                        selectedPartId != selectedMaterial ||
                                                        allVisible != visibleMaterials)
                                                        return@launch
                                                    val available = vertexTargets.filter {
                                                        it.materialId == selectedMaterial
                                                    }
                                                    val choice = if (hit == null) -1 else available.indexOfFirst {
                                                        it.mesh == hit.mesh && it.primitive == hit.primitive
                                                    }
                                                    if (hit != null && choice >= 0 &&
                                                        hit.vertex in 0 until available[choice].vertices) {
                                                        vertexPrimitiveIndex = choice
                                                        vertexIndex = hit.vertex
                                                        vertexIndexInput = hit.vertex.toString()
                                                        activeVertex = hit
                                                        vertexMode = true
                                                        sculptMode = false
                                                        showLayers = false
                                                        message = "Выбрана вершина #${hit.vertex} · меш #${hit.mesh}, примитив #${hit.primitive}."
                                                    } else {
                                                        activeVertex = null
                                                        showLayers = true
                                                        message = "Вершина не найдена на видимом выбранном материале. Поверни модель или скрой перекрывающий слой."
                                                    }
                                                } catch (error: Exception) {
                                                    if (request == requestId &&
                                                        chosenLocation == modelLocation) {
                                                        activeVertex = null
                                                        showLayers = true
                                                        message = error.message ?: "Не удалось выбрать вершину."
                                                    }
                                                } finally {
                                                    if (request == requestId) pickingBusy = false
                                                }
                                            }
                                        } catch (error: Exception) {
                                            pickingBusy = false
                                            showLayers = true
                                            message = error.message ?: "Не удалось построить луч касания."
                                        }
                                    }
                                    true
                                } else if (!isPickingBrushCenter) false
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

                if (isPickingVertex) {
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
                            Text("Коснись вершины видимой сетки",
                                style = MaterialTheme.typography.labelMedium,
                                color = TextPrimary,
                                modifier = Modifier.weight(1f, fill = false))
                            TextButton(onClick = {
                                isPickingVertex = false
                                showLayers = true
                            }) { Text("Отмена") }
                        }
                    }
                }
                val selectedVertex = activeVertex
                if (selectedVertex != null && vertexMode &&
                    !showLayers && !isPickingVertex && vertexDragAxis < 0 &&
                    partEdits.isEmpty() &&
                    savedSource != null && nodeLocation == modelLocation &&
                    selectedPartId == selectedVertex.materialId &&
                    vertexTargets.any {
                        it.mesh == selectedVertex.mesh &&
                        it.primitive == selectedVertex.primitive &&
                        selectedVertex.vertex in 0 until it.vertices
                    }) {
                    Surface(
                        modifier = Modifier.align(Alignment.BottomCenter).padding(10.dp),
                        color = Color(0xEE252434),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Column(
                            Modifier.padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                "Вершина #${selectedVertex.vertex} · шаг ${String.format(java.util.Locale.ROOT, "%.2f", vertexStep)}",
                                style = MaterialTheme.typography.labelMedium,
                                color = TextPrimary
                            )
                            Text(
                                "Перетаскивание: выбери ось, затем проведи пальцем по сцене.",
                                color = TextSecondary,
                                style = MaterialTheme.typography.labelSmall
                            )
                            Row(
                                Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf(0 to "Тянуть X", 1 to "Тянуть Y", 2 to "Тянуть Z")
                                    .forEach { (axis, label) ->
                                        OutlinedButton(
                                            enabled = !busy && !layerBusy && !pickingBusy &&
                                                vertexSurfacePicker != null &&
                                                vertexHistory.current.size < 64,
                                            onClick = {
                                                vertexDragAxis = axis
                                                vertexDragSession = null
                                                vertexDragPreview = 0f
                                                vertexDragSource = null
                                                vertexDragSelected = null
                                            },
                                            contentPadding = PaddingValues(horizontal = 10.dp)
                                        ) { Text(label) }
                                    }
                            }
                            Row(
                                Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf(0 to "X", 1 to "Y", 2 to "Z").forEach { (axis,label) ->
                                    listOf(-1f to "−", 1f to "+").forEach { (sign, mark) ->
                                        OutlinedButton(
                                            enabled = !busy && !layerBusy &&
                                                !pickingBusy && vertexHistory.current.size < 64,
                                            onClick = {
                                                val delta = vertexStep * sign
                                                val move = when(axis) {
                                                    0 -> VertexMove(
                                                        selectedVertex.mesh, selectedVertex.primitive,
                                                        selectedVertex.vertex, delta, 0f, 0f)
                                                    1 -> VertexMove(
                                                        selectedVertex.mesh, selectedVertex.primitive,
                                                        selectedVertex.vertex, 0f, delta, 0f)
                                                    else -> VertexMove(
                                                        selectedVertex.mesh, selectedVertex.primitive,
                                                        selectedVertex.vertex, 0f, 0f, delta)
                                                }
                                                try {
                                                    vertexHistory = vertexHistory.add(move)
                                                } catch (error: Exception) {
                                                    message = error.message ?:
                                                        "Не удалось изменить вершину."
                                                }
                                            },
                                            contentPadding = PaddingValues(horizontal = 9.dp)
                                        ) { Text("$label$mark") }
                                    }
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                TextButton(
                                    enabled = vertexHistory.canUndo,
                                    onClick = { vertexHistory = vertexHistory.undo() }
                                ) { Text("↶ Отмена") }
                                TextButton(onClick = { showLayers = true }) {
                                    Text("Настройки")
                                }
                                TextButton(onClick = { activeVertex = null }) {
                                    Text("Закрыть")
                                }
                            }
                        }
                    }
                }

                if (vertexDragAxis >= 0) {
                    Surface(
                        modifier = Modifier.align(Alignment.BottomCenter).padding(14.dp),
                        color = Color(0xEE252434),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Row(
                            Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            val axisLabel = when (vertexDragAxis) {
                                0 -> "X"
                                1 -> "Y"
                                else -> "Z"
                            }
                            Text(
                                "Тяни по сцене · $axisLabel: " +
                                    String.format(java.util.Locale.ROOT, "%+.2f", vertexDragPreview),
                                color = TextPrimary,
                                style = MaterialTheme.typography.labelMedium,
                                modifier = Modifier.weight(1f, fill = false)
                            )
                            TextButton(onClick = {
                                vertexDragAxis = -1
                                vertexDragSession = null
                                vertexDragPreview = 0f
                                vertexDragSource = null
                                vertexDragSelected = null
                            }) { Text("Отмена") }
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
                        CompactAction("Проекты", description = "Сохранённые GLB-проекты", onClick = {
                            if (!busy && recoveryReady) showProjects = true
                        })
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

            if (savedSource != null && recoveryReady) {
                Row(
                    modifier = Modifier.fillMaxWidth().background(PanelTone)
                        .padding(horizontal = 14.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("Контрольная точка", modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                    TextButton(
                        onClick = {
                            val snapshot = pauseDraft
                            if (snapshot != null) scope.launch {
                                busy = true
                                try {
                                    EditorSessionStore.saveCheckpoint(
                                        context.applicationContext.filesDir, snapshot)
                                    checkpointAvailable = true
                                    message = "Контрольная точка сохранена. Автосохранение её не перезапишет."
                                } catch (cancelled: CancellationException) {
                                    throw cancelled
                                } catch (error: Exception) {
                                    message = error.message ?: "Не удалось сохранить контрольную точку."
                                } finally {
                                    busy = false
                                }
                            }
                        },
                        enabled = !busy && !layerBusy && !pickingBusy
                    ) { Text("Запомнить") }
                    TextButton(
                        onClick = { confirmCheckpointRestore = true },
                        enabled = !busy && checkpointAvailable
                    ) { Text("Вернуть") }
                }
            }

            if (recoveryReady) {
                Row(
                    modifier = Modifier.fillMaxWidth().background(PanelTone)
                        .padding(horizontal = 14.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("Архив проекта", modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                    TextButton(
                        onClick = {
                            archiveExportPicker.launch(
                                modelName.substringBeforeLast('.', modelName) + "_project.zip")
                        },
                        enabled = !busy && savedSource != null && !layerBusy
                    ) { Text("Экспорт ZIP") }
                    TextButton(
                        onClick = {
                            if (savedSource == null) {
                                archiveImportPicker.launch(arrayOf("application/zip", "application/octet-stream"))
                            } else {
                                confirmArchiveImport = true
                            }
                        },
                        enabled = !busy
                    ) { Text("Импорт ZIP") }
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

            if (showProjects) {
                ModalBottomSheet(
                    onDismissRequest = { showProjects = false },
                    containerColor = PanelTone
                ) {
                    Column(
                        Modifier.fillMaxWidth().fillMaxHeight(0.78f)
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 18.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text("Мои проекты", style = MaterialTheme.typography.titleLarge)
                        Text("До ${EditorSessionStore.MAX_PROJECTS} GLB. Проекты хранятся внутри приложения; для переноса на другое устройство используй экспорт ZIP.",
                            style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                        projectListError?.let { error ->
                            Text(error, color = Color(0xFFFFB4A2))
                        }
                        if (projectList.isEmpty() && projectListError == null) {
                            Text("Пока нет сохранённых моделей.",
                                style = MaterialTheme.typography.bodyMedium)
                        }
                        projectList.forEach { project ->
                            Surface(
                                color = if (project.active) Highlight.copy(alpha = 0.12f)
                                    else Ink,
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Row(
                                    Modifier.fillMaxWidth().padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(project.name, maxLines = 2,
                                            style = MaterialTheme.typography.bodyMedium)
                                        val sizeMiB = project.bytes / (1024.0 * 1024.0)
                                        Text(
                                            (if (project.active) "Открыт · " else "") +
                                                (if (project.damaged) "Повреждён · " else "") +
                                                String.format(java.util.Locale.ROOT, "%.1f МиБ", sizeMiB),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = TextSecondary
                                        )
                                    }
                                    if (!project.active) {
                                        TextButton(
                                            enabled = !busy && !layerBusy && recoveryReady && !project.damaged,
                                            onClick = {
                                                val outgoing = pauseDraft
                                                val projectId = project.sourceFileName
                                                job?.cancel()
                                                val request = ++requestId
                                                job = scope.launch {
                                                    busy = true
                                                    recoveryReady = false
                                                    try {
                                                        val target = EditorSessionStore.peekProject(
                                                            context.applicationContext.filesDir, projectId)
                                                        val location = Uri.fromFile(target.source.file).toString()
                                                        val groups = GlbLayers.describe(
                                                            context.applicationContext, location)
                                                        val available = groups.map { it.id }.toSet()
                                                        if (available.isEmpty() ||
                                                            target.visible.isEmpty() ||
                                                            !target.visible.all { it in available } ||
                                                            !target.parts.keys.all { it in available } ||
                                                            !target.strokes.all { it.materialId in available } ||
                                                            target.brush.materialId !in available ||
                                                            (target.selected != null && target.selected !in available))
                                                            throw java.io.IOException("Слои сохранённого проекта не совпадают с моделью.")
                                                        val bounds = withContext(Dispatchers.IO) {
                                                            runCatching {
                                                                GlbBrushTarget.fromFile(target.source.file)
                                                            }.getOrDefault(emptyMap())
                                                        }
                                                        val current = outgoing
                                                            ?: throw java.io.IOException("Текущий проект недоступен.")
                                                        val opened = EditorSessionStore.activateProject(
                                                            context.applicationContext.filesDir, current, projectId)
                                                        if (request == requestId) {
                                                            materialBounds = bounds
                                                            materialLayers = groups
                                                            layerHistory = LayerHistory(states = listOf(opened.visible))
                                                            partHistory = PartHistory(steps = listOf(opened.parts))
                                                            sculptHistory = SculptHistory(states = listOf(opened.strokes))
                                                            vertexHistory = VertexHistory(states = listOf(opened.vertexMoves))
                                                            vertexMode = false
                                                            history = EditHistory(steps = listOf(opened.global))
                                                            sculptDraft = opened.brush
                                                            symmetryAxis = opened.symmetryAxis
                                                            selectedPartId = opened.selected?.takeIf { it in available }
                                                            cameraView = CameraView.entries.firstOrNull {
                                                                it.name == opened.camera
                                                            } ?: CameraView.FRONT
                                                            cameraEpoch++
                                                            modelName = opened.name
                                                            originalLocation = location
                                                            modelLocation = location
                                                            savedSource = opened.source
                                                            checkpointAvailable = runCatching {
                                                                EditorSessionStore.readCheckpoint(
                                                                    context.applicationContext.filesDir) != null
                                                            }.getOrDefault(false)
                                                            autosaveProblem = null
                                                            sculptMode = false
                                                            showLayers = false
                                                            isPickingBrushCenter = false
                                                            suggestedStrokes = emptyList()
                                                            surfacePicker = null
                                                            pickerLocation = null
                                                            nodeLocation = null
                                                            modelForPicking = null
                                                            showProjects = false
                                                            message = "Проект ${opened.name} открыт. Правки сохранены."
                                                        }
                                                    } catch (cancelled: CancellationException) {
                                                        throw cancelled
                                                    } catch (e: Exception) {
                                                        if (request == requestId)
                                                            projectListError = e.message ?: "Не удалось открыть проект."
                                                    } finally {
                                                        if (request == requestId) {
                                                            recoveryReady = true
                                                            busy = false
                                                        }
                                                    }
                                                }
                                            }
                                        ) { Text("Открыть") }
                                    } else {
                                        Text("Активный", color = Highlight,
                                            style = MaterialTheme.typography.labelSmall)
                                    }
                                    Box {
                                        TextButton(
                                            enabled = !busy && recoveryReady,
                                            onClick = { projectActionsMenu = project.sourceFileName }
                                        ) { Text("⋮") }
                                        DropdownMenu(
                                            expanded = projectActionsMenu == project.sourceFileName,
                                            onDismissRequest = { projectActionsMenu = null }
                                        ) {
                                            DropdownMenuItem(
                                                text = { Text("Переименовать") },
                                                enabled = !project.damaged,
                                                onClick = {
                                                    projectActionsMenu = null
                                                    projectTitleInput = project.name
                                                    projectToRename = project
                                                }
                                            )
                                            DropdownMenuItem(
                                                text = { Text("Создать копию") },
                                                enabled = !project.damaged &&
                                                    projectList.size < EditorSessionStore.MAX_PROJECTS,
                                                onClick = {
                                                    projectActionsMenu = null
                                                    projectTitleInput =
                                                        (project.name + " — копия").take(160)
                                                    projectToDuplicate = project
                                                }
                                            )
                                            if (!project.active) {
                                                DropdownMenuItem(
                                                    text = { Text("Удалить") },
                                                    onClick = {
                                                        projectActionsMenu = null
                                                        projectToDelete = project
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                }
            }
            if (showInfo && savedSource != null) {
                ModalBottomSheet(
                    onDismissRequest = { showInfo = false },
                    containerColor = PanelTone
                ) {
                    Column(
                        Modifier.fillMaxWidth().fillMaxHeight(0.83f)
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 20.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Инспектор GLB", style = MaterialTheme.typography.titleLarge)
                        Text(modelName, style = MaterialTheme.typography.bodyMedium,
                            color = TextSecondary)
                        val report = modelReport
                        if (report != null) {
                            val mib = report.bytes / (1024.0 * 1024.0)
                            Text("Размер: " + String.format(java.util.Locale.ROOT, "%.2f МиБ", mib))
                            Text("Меши: ${report.meshes}  ·  Примитивы: ${report.primitives}")
                            Text("Узлы: ${report.nodes}  ·  Сцены: ${report.scenes}")
                            Text("Материалы: ${report.materials}  ·  Текстуры: ${report.textures}")
                            Text("Изображения: ${report.images}")
                            Text("Вершины примитивов*: ${report.vertexReferences}")
                            Text("Треугольники*: ${report.triangles}")
                            Text("Анимации: ${report.animations}  ·  Скелеты: ${report.skins}")
                            Text("Morph targets: ${report.morphTargets}")
                            if (report.warnings.isNotEmpty()) {
                                Spacer(Modifier.height(4.dp))
                                Text("Ограничения редактирования",
                                    style = MaterialTheme.typography.titleSmall)
                                report.warnings.forEach { warning ->
                                    Text("• $warning", color = Color(0xFFFFB4A2),
                                        style = MaterialTheme.typography.bodySmall)
                                }
                            }
                            Text("* Сумма по примитивам исходных мешей. Экземпляры одной сетки не учитываются повторно; данные не являются количеством уникальных вершин или видимых треугольников.",
                                style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                        } else {
                            Text(modelReportError ?: "Чтение параметров GLB…",
                                style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                        }
                        HorizontalDivider()
                        Text("Текущие правки", style = MaterialTheme.typography.titleSmall)
                        Text("Поворот: ${edit.x}° / ${edit.y}° / ${edit.z}°")
                        Text("Позиция: ${edit.moveX} / ${edit.moveY} / ${edit.moveZ}")
                        Text("Масштаб: ${edit.scalePercent}%")
                        Text("Видимые слои: ${visibleMaterials.size}/${materialLayers.size}  ·  Деформации: ${sculptStrokes.size}")
                        Text("Инспектор не изменяет модель и читает только JSON-описание GLB.",
                            style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                        Spacer(Modifier.height(12.dp))
                    }
                }
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
                            Row(
                                Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                if (!sculptMode && !vertexMode) {
                                    Button(onClick = { sculptMode = false; vertexMode = false }) {
                                        Text("Положение")
                                    }
                                } else {
                                    OutlinedButton(onClick = { sculptMode = false; vertexMode = false }) {
                                        Text("Положение")
                                    }
                                }
                                if (sculptMode && !vertexMode) {
                                    Button(onClick = { sculptMode = true; vertexMode = false }) {
                                        Text("Форма")
                                    }
                                } else {
                                    OutlinedButton(onClick = { sculptMode = true; vertexMode = false }) {
                                        Text("Форма")
                                    }
                                }
                                if (vertexMode) {
                                    Button(onClick = { vertexMode = true; sculptMode = false }) {
                                        Text("Вершины")
                                    }
                                } else {
                                    OutlinedButton(onClick = { vertexMode = true; sculptMode = false }) {
                                        Text("Вершины")
                                    }
                                }
                            }
                            if (vertexMode) {
                                Text("Точное изменение POSITION-вершины",
                                    style = MaterialTheme.typography.titleSmall)
                                Text("Выбор точной вершины по касанию или по индексу исходного GLB.",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = TextSecondary)
                                Button(
                                    enabled = !busy && !layerBusy && !pickingBusy &&
                                        vertexSurfacePicker != null &&
                                        nodeLocation == modelLocation &&
                                        partEdits.isEmpty() &&
                                        partId in visibleMaterials,
                                    onClick = {
                                        activeVertex = null
                                        isPickingBrushCenter = false
                                        isPickingVertex = true
                                        showLayers = false
                                    },
                                    modifier = Modifier.fillMaxWidth()
                                ) { Text("Выбрать вершину касанием") }
                                if (vertexSurfacePicker == null) {
                                    Text(vertexPickerError ?:
                                        "Подготовка точного выбора. Для сложных сцен доступен ввод индекса.",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = TextSecondary)
                                }
                                val options = vertexTargets.filter { it.materialId == partId }
                                val target = options.getOrNull(
                                    vertexPrimitiveIndex.takeIf { it in options.indices } ?: 0)
                                if (target == null) {
                                    Text(vertexTargetsError ?: "Для материала нет доступных статических TRIANGLES с FLOAT VEC3.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Color(0xFFFFB4A2))
                                } else {
                                    val current = options.indexOf(target)
                                    Text("Меш #${target.mesh}, примитив #${target.primitive} · ${target.vertices} вершин",
                                        style = MaterialTheme.typography.bodySmall)
                                    if (options.size > 1) {
                                        Stepper("Примитив", "${current+1}/${options.size}",
                                            {
                                                vertexPrimitiveIndex = (current-1).coerceAtLeast(0)
                                                vertexIndex = 0
                                                vertexIndexInput = "0"
                                                activeVertex = null
                                            }, {
                                                vertexPrimitiveIndex = (current+1).coerceAtMost(options.lastIndex)
                                                vertexIndex = 0
                                                vertexIndexInput = "0"
                                                activeVertex = null
                                            })
                                    }
                                    OutlinedTextField(
                                        value = vertexIndexInput,
                                        onValueChange = { entered ->
                                            if (entered.length <= 7 && entered.all { it.isDigit() }) {
                                                vertexIndexInput = entered
                                                activeVertex = null
                                                entered.toIntOrNull()?.let { vertexIndex = it }
                                            }
                                        },
                                        singleLine = true,
                                        label = { Text("Индекс вершины (0…${target.vertices-1})") },
                                        modifier = Modifier.fillMaxWidth()
                                    )
                                    Row(
                                        Modifier.horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        listOf(.01f to "0,01", .1f to "0,1", 1f to "1,0")
                                            .forEach { (size, label) ->
                                                if (vertexStep == size) {
                                                    Button(onClick = { vertexStep = size }) {
                                                        Text("Шаг $label")
                                                    }
                                                } else {
                                                    OutlinedButton(onClick = { vertexStep = size }) {
                                                        Text("Шаг $label")
                                                    }
                                                }
                                            }
                                    }
                                    val selectedIndex = vertexIndexInput.toIntOrNull()
                                    val canMove = !busy && !layerBusy &&
                                        selectedIndex != null && selectedIndex in 0 until target.vertices &&
                                        vertexHistory.current.size < 64
                                    fun nudge(axis: Int, sign: Float) {
                                        if (selectedIndex == null) return
                                        val offset = vertexStep * sign
                                        val move = when (axis) {
                                            0 -> VertexMove(target.mesh, target.primitive, selectedIndex, offset, 0f, 0f)
                                            1 -> VertexMove(target.mesh, target.primitive, selectedIndex, 0f, offset, 0f)
                                            else -> VertexMove(target.mesh, target.primitive, selectedIndex, 0f, 0f, offset)
                                        }
                                        try {
                                            vertexHistory = vertexHistory.add(move)
                                        } catch (error: Exception) {
                                            message = error.message ?: "Не удалось переместить вершину."
                                        }
                                    }
                                    listOf(0 to "X", 1 to "Y", 2 to "Z").forEach { (axis, name) ->
                                        Row(Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                            verticalAlignment = Alignment.CenterVertically) {
                                            Text(name, Modifier.weight(1f))
                                            OutlinedButton(
                                                enabled = canMove,
                                                onClick = { nudge(axis, -1f) }
                                            ) { Text("−") }
                                            OutlinedButton(
                                                enabled = canMove,
                                                onClick = { nudge(axis, 1f) }
                                            ) { Text("+") }
                                        }
                                    }
                                }
                                Text("Правки вершин: ${vertexHistory.current.size}/64",
                                    style = MaterialTheme.typography.labelMedium)
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    OutlinedButton(
                                        enabled = vertexHistory.canUndo,
                                        onClick = { vertexHistory = vertexHistory.undo() }
                                    ) { Text("↶") }
                                    OutlinedButton(
                                        enabled = vertexHistory.canRedo,
                                        onClick = { vertexHistory = vertexHistory.redo() }
                                    ) { Text("↷") }
                                    TextButton(
                                        enabled = vertexHistory.current.isNotEmpty(),
                                        onClick = { vertexHistory = vertexHistory.reset() }
                                    ) { Text("Сброс") }
                                }
                                Text("Редактируется исходная сетка выбранного примитива. Общие буферы других примитивов не меняются.",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = TextSecondary)
                            } else if (!sculptMode) {
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
                                Text(
                                    "Симметрия кисти: зеркальная деформация относительно центра границ материала. Вторая сторона изменяется при «Применить».",
                                    style = MaterialTheme.typography.labelSmall, color = TextSecondary
                                )
                                Row(
                                    Modifier.horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    listOf(0 to "Выкл", 1 to "X", 2 to "Y", 3 to "Z")
                                        .forEach { (axis, label) ->
                                            if (symmetryAxis == axis) {
                                                Button(
                                                    onClick = { symmetryAxis = axis },
                                                    contentPadding = PaddingValues(horizontal = 12.dp)
                                                ) { Text(label) }
                                            } else {
                                                OutlinedButton(
                                                    onClick = { symmetryAxis = axis },
                                                    contentPadding = PaddingValues(horizontal = 12.dp)
                                                ) { Text(label) }
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
                                Text(
                                    "Деформаций: ${sculptHistory.current.size}/20" +
                                        if (symmetryAxis != 0) " · Зеркальная кисть активна" else "",

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
                                            val operations = SculptSymmetry.expand(path, symmetryAxis)
                                            if (operations.size + sculptHistory.current.size > 20)
                                                throw java.io.IOException(
                                                    "Симметричному пути нужно ${operations.size} деформаций. " +
                                                        "Доступно ${20 - sculptHistory.current.size}. " +
                                                        "Уменьши путь или сохрани GLB."
                                                )
                                            sculptHistory = sculptHistory.addPath(operations)
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
