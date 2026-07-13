// Estado Global
const state = {
    jugadores: [],
    partidas: [],
    campos: [],
    editandoJugadorId: null,
    editandoPartidaId: null,
    jugadorDetalleId: null,
    sortPartidas: '-fecha', // Default: más reciente primero
    filtros: {
        jugador: '',
        campo: '',
        resultado: '',
        fechaDesde: '',
        fechaHasta: ''
    },
    filtrosAnalitica: {
        jugador: '',
        campo: '',
        fechaDesde: '',
        fechaHasta: ''
    }
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    // Set fecha actual por defecto
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('partida-fecha').value = today;

    // Cargar datos - skip render on jugadores until partidas are loaded
    await cargarJugadores(true); // Skip rendering
    await cargarPartidas();
    await cargarCampos();
    
    // Clean up orphaned partidas (games with deleted players)
    await limpiarPartidasHuerfanas();
    
    // Now render jugadores with partidas data available
    renderizarJugadores();
    
    // Setup event listeners
    setupNavigation();
    setupJugadoresForm();
    setupPartidasForm();
    setupFiltros();
    setupAnalitica();
}

// ==================== NAVEGACIÓN ====================
function setupNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Actualizar botones de navegación
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Actualizar contenido
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Acciones específicas por tab
    if (tabName === 'partidas') {
        cargarPartidas();
    } else if (tabName === 'analitica') {
        mostrarAnaliticaGeneral();
    }
}

// ==================== UTILIDADES DE SLIDING ====================
function parseSliding(sliding) {
    // Convierte string como "+3", "-2", "0" a número
    if (typeof sliding === 'number') return sliding;
    const str = String(sliding).trim();
    if (str === '0' || str === '') return 0;
    return parseInt(str);
}

function formatSliding(numero) {
    // Convierte número a string con formato "+3", "-2", "0"
    const num = typeof numero === 'string' ? parseSliding(numero) : numero;
    if (num === 0) return '0';
    return num > 0 ? `+${num}` : `${num}`;
}

function ajustarSliding(slidingActual, gano) {
    // Ajusta el sliding basado en el resultado
    const actual = parseSliding(slidingActual);
    console.log(`📊 ajustarSliding - Input: "${slidingActual}" (parsed: ${actual}), Ganó: ${gano}`);
    
    let nuevoSliding;
    if (gano) {
        // Si gano, bajo 1 punto (doy más o recibo menos)
        nuevoSliding = formatSliding(actual - 1);
    } else {
        // Si pierdo, subo 1 punto (recibo más o doy menos)
        nuevoSliding = formatSliding(actual + 1);
    }
    
    console.log(`📊 ajustarSliding - Output: "${nuevoSliding}"`);
    return nuevoSliding;
}

function getSlidingClass(sliding) {
    const num = parseSliding(sliding);
    if (num > 0) return 'positive';
    if (num < 0) return 'negative';
    return '';
}

// ==================== JUGADORES ====================
function setupJugadoresForm() {
    const btnNuevo = document.getElementById('btn-nuevo-jugador');
    const btnCancelar = document.getElementById('btn-cancelar-jugador');
    const form = document.getElementById('form-jugador');
    const btnCargarDatos = document.getElementById('btn-cargar-datos');
    const searchInput = document.getElementById('search-jugadores');
    const btnViewGrid = document.getElementById('view-grid');
    const btnViewList = document.getElementById('view-list');
    
    btnNuevo.addEventListener('click', () => {
        mostrarFormularioJugador();
    });
    
    btnCancelar.addEventListener('click', () => {
        ocultarFormularioJugador();
    });
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await guardarJugador();
    });
    
    // Botón de carga inicial de jugadores
    if (btnCargarDatos) {
        btnCargarDatos.addEventListener('click', async () => {
            if (typeof cargarJugadoresIniciales === 'function') {
                btnCargarDatos.disabled = true;
                btnCargarDatos.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
                await cargarJugadoresIniciales();
                btnCargarDatos.disabled = false;
                btnCargarDatos.innerHTML = '<i class="fas fa-check"></i> ¡Jugadores Cargados!';
                setTimeout(() => {
                    document.getElementById('carga-inicial-container').style.display = 'none';
                }, 2000);
            }
        });
    }
    
    // Búsqueda de jugadores
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filtrarJugadores(e.target.value);
        });
    }
    
    // Toggle de vista Grid/List
    if (btnViewGrid && btnViewList) {
        btnViewGrid.addEventListener('click', () => {
            btnViewGrid.classList.add('active');
            btnViewList.classList.remove('active');
            document.getElementById('jugadores-grid').classList.remove('list-view');
            document.getElementById('jugadores-grid').classList.add('grid-view');
        });
        
        btnViewList.addEventListener('click', () => {
            btnViewList.classList.add('active');
            btnViewGrid.classList.remove('active');
            document.getElementById('jugadores-grid').classList.add('list-view');
            document.getElementById('jugadores-grid').classList.remove('grid-view');
        });
    }
    
    // Filtros y orden
    const sortSelect = document.getElementById('sort-jugadores');
    const filterSelect = document.getElementById('filter-estado');
    
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            renderizarJugadores();
        });
    }
    
    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            renderizarJugadores();
        });
    }
}

function filtrarJugadores(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const jugadoresFiltrados = term === '' 
        ? state.jugadores 
        : state.jugadores.filter(j => j.nombre.toLowerCase().includes(term));
    
    renderizarJugadores(jugadoresFiltrados);
}

function mostrarFormularioJugador(jugador = null) {
    const formContainer = document.getElementById('form-jugador-container');
    const form = document.getElementById('form-jugador');
    const title = document.getElementById('form-jugador-title');
    
    if (jugador) {
        // Editar jugador
        state.editandoJugadorId = jugador.id;
        title.textContent = 'Editar Jugador';
        document.getElementById('jugador-nombre').value = jugador.nombre;
        document.getElementById('jugador-sliding').value = jugador.sliding_actual || jugador.sliding_inicial;
        document.getElementById('jugador-notas').value = jugador.notas || '';
    } else {
        // Nuevo jugador
        state.editandoJugadorId = null;
        title.textContent = 'Agregar Jugador';
        form.reset();
    }
    
    formContainer.style.display = 'block';
    formContainer.scrollIntoView({ behavior: 'smooth' });
}

function ocultarFormularioJugador() {
    const formContainer = document.getElementById('form-jugador-container');
    const form = document.getElementById('form-jugador');
    
    formContainer.style.display = 'none';
    form.reset();
    state.editandoJugadorId = null;
}

async function guardarJugador() {
    const nombre = document.getElementById('jugador-nombre').value.trim();
    const sliding = document.getElementById('jugador-sliding').value.trim();
    const notas = document.getElementById('jugador-notas').value.trim();
    
    const jugadorData = {
        nombre,
        sliding_inicial: formatSliding(sliding),
        sliding_actual: formatSliding(sliding),
        notas
    };
    
    try {
        if (state.editandoJugadorId) {
            // Actualizar jugador existente
            const jugadorActual = state.jugadores.find(j => j.id === state.editandoJugadorId);
            jugadorData.sliding_inicial = jugadorActual.sliding_inicial; // Mantener el inicial
            jugadorData.sliding_actual = formatSliding(sliding); // Actualizar el actual
            
            const response = await fetch(`tables/jugadores/${state.editandoJugadorId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jugadorData)
            });
            
            if (!response.ok) throw new Error('Error al actualizar jugador');
            
            mostrarMensaje('Jugador actualizado exitosamente', 'success');
        } else {
            // Crear nuevo jugador
            const response = await fetch('tables/jugadores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jugadorData)
            });
            
            if (!response.ok) throw new Error('Error al crear jugador');
            
            mostrarMensaje('Jugador agregado exitosamente', 'success');
        }
        
        ocultarFormularioJugador();
        await cargarJugadores();
    } catch (error) {
        console.error('Error:', error);
        mostrarMensaje('Error al guardar jugador', 'error');
    }
}

async function cargarJugadores(skipRender = false) {
    try {
        console.log('📥 Cargando jugadores desde la base de datos...');
        const response = await fetch('tables/jugadores?limit=100&sort=-created_at');
        const data = await response.json();
        
        // Filter out soft-deleted records (if API returns them)
        const allJugadores = data.data || [];
        state.jugadores = allJugadores.filter(j => !j.deleted);
        
        const deletedCount = allJugadores.length - state.jugadores.length;
        if (deletedCount > 0) {
            console.log(`🗑️ ${deletedCount} jugadores eliminados filtrados`);
        }
        
        console.log(`✅ ${state.jugadores.length} jugadores activos cargados`);
        
        // Only render if not skipping (used during initial load)
        if (!skipRender) {
            renderizarJugadores();
        }
        actualizarSelectJugadores();
        actualizarFiltroJugadores();
    } catch (error) {
        console.error('Error al cargar jugadores:', error);
        mostrarMensaje('Error al cargar jugadores', 'error');
    }
}

function renderizarJugadores(jugadoresList = null) {
    const grid = document.getElementById('jugadores-grid');
    const cargaInicial = document.getElementById('carga-inicial-container');
    const sortSelect = document.getElementById('sort-jugadores');
    const filterSelect = document.getElementById('filter-estado');
    const searchInput = document.getElementById('search-jugadores');
    
    let jugadores = jugadoresList || state.jugadores;
    
    // Aplicar búsqueda
    if (searchInput && searchInput.value.trim()) {
        const term = searchInput.value.toLowerCase().trim();
        jugadores = jugadores.filter(j => j.nombre.toLowerCase().includes(term));
    }
    
    // Aplicar filtro por estado
    if (filterSelect && filterSelect.value !== 'todos') {
        const filter = filterSelect.value;
        jugadores = jugadores.filter(j => {
            const partidasJugador = state.partidas.filter(p => p.jugador_id === j.id);
            const balance = partidasJugador.reduce((sum, p) => {
                const importe = parseFloat(p.importe) || 0;
                return sum + (p.resultado === 'Ganado' ? importe : -importe);
            }, 0);
            
            switch(filter) {
                case 'ganando':
                    return balance > 0;
                case 'perdiendo':
                    return balance < 0;
                case 'con-notas':
                    return j.notas && j.notas.trim() !== '';
                case 'sin-notas':
                    return !j.notas || j.notas.trim() === '';
                case 'con-partidas':
                    return partidasJugador.length > 0;
                case 'sin-partidas':
                    return partidasJugador.length === 0;
                default:
                    return true;
            }
        });
    }
    
    // Aplicar orden
    const sortValue = sortSelect ? sortSelect.value : 'nombre-asc';
    jugadores = [...jugadores].sort((a, b) => {
        const partidasA = state.partidas.filter(p => p.jugador_id === a.id);
        const partidasB = state.partidas.filter(p => p.jugador_id === b.id);
        
        const balanceA = partidasA.reduce((sum, p) => {
            const importe = parseFloat(p.importe) || 0;
            return sum + (p.resultado === 'Ganado' ? importe : -importe);
        }, 0);
        
        const balanceB = partidasB.reduce((sum, p) => {
            const importe = parseFloat(p.importe) || 0;
            return sum + (p.resultado === 'Ganado' ? importe : -importe);
        }, 0);
        
        const slidingA = parseSliding(a.sliding_actual || a.sliding_inicial);
        const slidingB = parseSliding(b.sliding_actual || b.sliding_inicial);
        
        switch(sortValue) {
            case 'nombre-asc':
                return a.nombre.localeCompare(b.nombre, 'es');
            case 'nombre-desc':
                return b.nombre.localeCompare(a.nombre, 'es');
            case 'balance-desc':
                return balanceB - balanceA;
            case 'balance-asc':
                return balanceA - balanceB;
            case 'sliding-desc':
                return slidingB - slidingA;
            case 'sliding-asc':
                return slidingA - slidingB;
            case 'partidas-desc':
                return partidasB.length - partidasA.length;
            case 'partidas-asc':
                return partidasA.length - partidasB.length;
            case 'ultima-partida':
                const ultimaA = partidasA.length > 0 ? Math.max(...partidasA.map(p => new Date(p.fecha).getTime())) : 0;
                const ultimaB = partidasB.length > 0 ? Math.max(...partidasB.map(p => new Date(p.fecha).getTime())) : 0;
                return ultimaB - ultimaA;
            default:
                return a.nombre.localeCompare(b.nombre, 'es');
        }
    });
    
    if (jugadores.length === 0) {
        // Mostrar mensaje de carga inicial
        if (cargaInicial && state.jugadores.length === 0) {
            cargaInicial.style.display = 'block';
        }
        
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <i class="fas fa-users"></i>
                <h3>No hay jugadores registrados</h3>
                <p>Comienza agregando tu primer jugador o carga los 51 jugadores predefinidos</p>
            </div>
        `;
        return;
    }
    
    // Ocultar mensaje de carga inicial si hay jugadores
    if (cargaInicial) {
        cargaInicial.style.display = 'none';
    }
    
    grid.innerHTML = jugadores.map(jugador => {
        const slidingActual = jugador.sliding_actual || jugador.sliding_inicial;
        const slidingClass = getSlidingClass(slidingActual);
        const cambioSliding = jugador.sliding_inicial !== slidingActual;
        
        // Calcular balance contra este jugador
        const partidasJugador = state.partidas.filter(p => p.jugador_id === jugador.id);
        const balance = partidasJugador.reduce((sum, p) => {
            const importe = parseFloat(p.importe) || 0;
            return sum + (p.resultado === 'Ganado' ? importe : -importe);
        }, 0);
        const balanceClass = balance >= 0 ? 'importe-positivo' : 'importe-negativo';
        const balancePrefix = balance >= 0 ? '+' : '-';
        
        // Debug log para jugadores específicos
        if (jugador.nombre && jugador.nombre.toLowerCase().includes('abb')) {
            console.log(`💰 ABB Debug:`, {
                nombre: jugador.nombre,
                id: jugador.id,
                partidasEncontradas: partidasJugador.length,
                balance: balance,
                partidas: partidasJugador.map(p => ({
                    fecha: new Date(p.fecha).toLocaleDateString(),
                    resultado: p.resultado,
                    importe: p.importe
                }))
            });
        }
        
        return `
            <div class="jugador-card" onclick="verPerfilJugador('${jugador.id}')" style="cursor: pointer;">
                <div class="jugador-header">
                    <div class="jugador-info">
                        <h3>${jugador.nombre}</h3>
                    </div>
                    ${jugador.notas ? `
                    <div class="jugador-notas" onclick="event.stopPropagation(); editarJugador('${jugador.id}');" style="cursor: pointer;" title="Click para editar nota">
                        <i class="fas fa-sticky-note"></i>
                        <span>${jugador.notas}</span>
                    </div>
                    ` : `
                    <div class="jugador-notas jugador-notas-empty" onclick="event.stopPropagation(); editarJugador('${jugador.id}');" style="cursor: pointer;" title="Click para agregar nota">
                        <i class="fas fa-sticky-note"></i>
                        <span></span>
                    </div>
                    `}
                    <div class="jugador-handicap ${slidingClass}">
                        ${slidingActual}
                    </div>
                </div>
                <div class="jugador-balance-card ${balance >= 0 ? 'balance-positive' : 'balance-negative'}">
                    <div class="balance-label">
                        ${partidasJugador.length > 0 ? (balance >= 0 ? 'GANADO' : 'PERDIDO') : 'SIN DATOS'}
                    </div>
                    <div class="balance-amount ${balanceClass}">
                        ${partidasJugador.length > 0 ? `${balancePrefix}$${Math.abs(balance).toFixed(2)}` : '$0.00'}
                    </div>
                </div>
                <div class="jugador-sliding-change">
                    <i class="fas fa-history"></i> Inicial: <strong>${jugador.sliding_inicial}</strong>${cambioSliding ? ` → Actual: <strong>${slidingActual}</strong>` : ''}
                </div>
                ${jugador.notas ? `
                <div class="jugador-notas-thumbnail" onclick="event.stopPropagation(); editarJugador('${jugador.id}');" style="cursor: pointer;" title="Click para editar nota">
                    <i class="fas fa-sticky-note"></i>
                    <span>${jugador.notas}</span>
                </div>
                ` : `
                <div class="jugador-notas-placeholder" onclick="event.stopPropagation(); editarJugador('${jugador.id}');" style="cursor: pointer;" title="Click para agregar nota">
                    <i class="fas fa-plus-circle"></i>
                    <span>Agregar nota...</span>
                </div>
                `}
                <div class="jugador-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-success btn-small" onclick="nuevaPartidaConJugador('${jugador.id}')" title="Registrar nueva partida">
                        <i class="fas fa-plus-circle"></i> Nueva Partida
                    </button>
                    <button class="btn btn-primary btn-small" onclick="editarJugador('${jugador.id}')" title="Editar jugador">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-danger btn-small" onclick="eliminarJugador('${jugador.id}', '${jugador.nombre}')" title="Eliminar jugador">
                        <i class="fas fa-trash"></i> Eliminar
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function verPerfilJugador(jugadorId) {
    // Cambiar a tab de analítica y mostrar detalle del jugador
    switchTab('analitica');
    setTimeout(() => {
        mostrarDetalleJugador(jugadorId);
    }, 100);
}

function editarJugador(jugadorId) {
    const jugador = state.jugadores.find(j => j.id === jugadorId);
    if (jugador) {
        mostrarFormularioJugador(jugador);
    }
}

function nuevaPartidaConJugador(jugadorId) {
    // Cambiar a tab de partidas
    switchTab('partidas');
    
    // Esperar a que se renderice el tab y luego abrir el formulario
    setTimeout(() => {
        mostrarFormularioPartida();
        
        // Pre-seleccionar el jugador
        setTimeout(() => {
            const jugadorSelect = document.getElementById('partida-jugador');
            if (jugadorSelect) {
                jugadorSelect.value = jugadorId;
                
                // Trigger change event para actualizar el sliding display
                const event = new Event('change');
                jugadorSelect.dispatchEvent(event);
                
                console.log(`✅ Formulario de partida abierto con jugador pre-seleccionado: ${jugadorId}`);
            }
        }, 100);
    }, 100);
}

async function eliminarJugador(jugadorId, nombre) {
    if (!confirm(`¿Estás seguro de eliminar a ${nombre}? Esto también eliminará TODAS sus partidas de forma permanente.`)) {
        return;
    }
    
    try {
        console.log(`🗑️ Eliminando jugador ${nombre} (ID: ${jugadorId})`);
        console.log(`🔍 Tipo de jugadorId:`, typeof jugadorId, jugadorId);
        
        // Primero, encontrar todas las partidas del jugador
        // Usar comparación flexible para manejar string vs UUID
        const partidasJugador = state.partidas.filter(p => {
            const matches = p.jugador_id === jugadorId || String(p.jugador_id) === String(jugadorId);
            if (matches) {
                console.log(`  🎯 Partida encontrada: ${p.id}, jugador_id: ${p.jugador_id} (tipo: ${typeof p.jugador_id})`);
            }
            return matches;
        });
        
        console.log(`📋 Encontradas ${partidasJugador.length} partidas para eliminar`);
        
        if (partidasJugador.length === 0) {
            console.warn(`⚠️ No se encontraron partidas para el jugador ${nombre} (ID: ${jugadorId})`);
            console.log(`🔍 Total de partidas en state:`, state.partidas.length);
            console.log(`🔍 Todos los jugador_id en partidas:`, [...new Set(state.partidas.map(p => p.jugador_id))]);
        }
        
        // Eliminar todas las partidas del jugador
        let partidasEliminadas = 0;
        let erroresPartidas = 0;
        
        for (const partida of partidasJugador) {
            try {
                console.log(`  🗑️ Eliminando partida ${partida.id}...`);
                const deleteResponse = await fetch(`tables/partidas/${partida.id}`, {
                    method: 'DELETE'
                });
                
                if (deleteResponse.ok || deleteResponse.status === 204) {
                    partidasEliminadas++;
                    console.log(`    ✅ Partida eliminada: ${new Date(partida.fecha).toLocaleDateString()}`);
                } else {
                    erroresPartidas++;
                    const errorText = await deleteResponse.text();
                    console.error(`    ❌ Error al eliminar partida ${partida.id}: Status ${deleteResponse.status}, ${errorText}`);
                }
            } catch (error) {
                erroresPartidas++;
                console.error(`    ❌ Error al eliminar partida:`, error);
            }
        }
        
        console.log(`📊 Resultado: ${partidasEliminadas} partidas eliminadas, ${erroresPartidas} errores`);
        
        // Ahora eliminar el jugador
        console.log(`🗑️ Eliminando jugador ${jugadorId}...`);
        const response = await fetch(`tables/jugadores/${jugadorId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok && response.status !== 204) {
            const errorText = await response.text();
            throw new Error(`Error al eliminar jugador: Status ${response.status}, ${errorText}`);
        }
        
        console.log(`✅ Jugador ${nombre} eliminado exitosamente`);
        mostrarMensaje(`Jugador "${nombre}" y ${partidasEliminadas} partida(s) eliminadas correctamente`, 'success');
        
        // Limpiar state local inmediatamente
        state.jugadores = state.jugadores.filter(j => j.id !== jugadorId);
        state.partidas = state.partidas.filter(p => p.jugador_id !== jugadorId && String(p.jugador_id) !== String(jugadorId));
        
        // Recargar datos desde la base de datos para confirmar
        await cargarPartidas();
        await cargarJugadores();
        
        // Si estamos en la pestaña de analítica, refrescarla
        const analiticaTab = document.getElementById('analitica-tab');
        if (analiticaTab && analiticaTab.classList.contains('active')) {
            console.log('🔄 Refrescando Analítica...');
            mostrarAnaliticaGeneral();
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarMensaje('Error al eliminar jugador', 'error');
    }
}

function actualizarSelectJugadores() {
    const select = document.getElementById('partida-jugador');
    
    // Ordenar alfabéticamente A-Z (verificado 2 veces)
    const jugadoresOrdenados = [...state.jugadores].sort((a, b) => {
        return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
    
    select.innerHTML = '<option value="">Seleccione un jugador</option>' +
        jugadoresOrdenados.map(jugador => {
            const sliding = jugador.sliding_actual || jugador.sliding_inicial;
            return `<option value="${jugador.id}" data-nombre="${jugador.nombre}" data-sliding="${sliding}">${jugador.nombre} (${sliding})</option>`;
        }).join('');
    
    // Event listener para actualizar info de sliding
    select.addEventListener('change', (e) => {
        const option = e.target.options[e.target.selectedIndex];
        const slidingCard = document.getElementById('sliding-actual-card');
        
        if (option.value) {
            const sliding = option.dataset.sliding;
            const slidingClass = getSlidingClass(sliding);
            document.getElementById('sliding-info-display').innerHTML = `
                <span class="sliding-badge ${slidingClass}">${sliding}</span>
            `;
            slidingCard.style.display = 'block';
        } else {
            document.getElementById('sliding-info-display').innerHTML = `
                <span class="sliding-badge">Seleccione un jugador</span>
            `;
            slidingCard.style.display = 'none';
        }
    });
}

// ==================== CAMPOS ====================
async function cargarCampos() {
    try {
        const response = await fetch('tables/campos?limit=100');
        const data = await response.json();
        state.campos = data.data || [];
        actualizarDatalistCampos();
        actualizarFiltroCampos();
    } catch (error) {
        console.error('Error al cargar campos:', error);
    }
}

async function guardarCampo(nombreCampo) {
    // Verificar si ya existe
    if (state.campos.some(c => c.nombre.toLowerCase() === nombreCampo.toLowerCase())) {
        return;
    }
    
    try {
        await fetch('tables/campos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombreCampo })
        });
        await cargarCampos();
    } catch (error) {
        console.error('Error al guardar campo:', error);
    }
}

async function gestionarCampos() {
    if (state.campos.length === 0) {
        alert('No hay campos registrados aún.');
        return;
    }
    
    const camposOrdenados = [...state.campos].sort((a, b) => 
        a.nombre.localeCompare(b.nombre, 'es')
    );
    
    const lista = camposOrdenados.map((c, i) => 
        `${i + 1}. ${c.nombre}`
    ).join('\n');
    
    const mensaje = `Campos de Golf Registrados:\n\n${lista}\n\n¿Deseas eliminar algún campo? (Escribe el número o presiona Cancelar)`;
    const respuesta = prompt(mensaje);
    
    if (respuesta) {
        const numero = parseInt(respuesta);
        if (numero > 0 && numero <= camposOrdenados.length) {
            const campoEliminar = camposOrdenados[numero - 1];
            const confirmar = confirm(`¿Estás seguro de eliminar "${campoEliminar.nombre}"?`);
            
            if (confirmar) {
                try {
                    await fetch(`tables/campos/${campoEliminar.id}`, {
                        method: 'DELETE'
                    });
                    mostrarMensaje('Campo eliminado exitosamente', 'success');
                    await cargarCampos();
                } catch (error) {
                    console.error('Error al eliminar campo:', error);
                    mostrarMensaje('Error al eliminar campo', 'error');
                }
            }
        } else {
            alert('Número inválido');
        }
    }
}

function actualizarDatalistCampos() {
    const select = document.getElementById('partida-campo-select');
    if (!select) return;
    
    // Ordenar campos alfabéticamente
    const camposOrdenados = [...state.campos].sort((a, b) => 
        a.nombre.localeCompare(b.nombre, 'es')
    );
    
    select.innerHTML = '<option value="">Seleccione un campo</option>' +
        camposOrdenados.map(campo => 
            `<option value="${campo.nombre}">${campo.nombre}</option>`
        ).join('') +
        '<option value="__nuevo__">+ Agregar nuevo campo...</option>';
}

// ==================== PARTIDAS ====================
function setupPartidasForm() {
    const btnNueva = document.getElementById('btn-nueva-partida');
    const btnCancelar = document.getElementById('btn-cancelar-partida');
    const btnGestionarCampos = document.getElementById('btn-gestionar-campos');
    const form = document.getElementById('form-partida');
    const campoSelect = document.getElementById('partida-campo-select');
    const campoNuevo = document.getElementById('partida-campo-nuevo');
    
    btnNueva.addEventListener('click', () => {
        mostrarFormularioPartida();
    });
    
    btnCancelar.addEventListener('click', () => {
        ocultarFormularioPartida();
    });
    
    if (btnGestionarCampos) {
        btnGestionarCampos.addEventListener('click', () => {
            gestionarCampos();
        });
    }
    
    // Manejar cambio de campo
    if (campoSelect) {
        campoSelect.addEventListener('change', (e) => {
            if (e.target.value === '__nuevo__') {
                campoNuevo.style.display = 'block';
                campoNuevo.required = true;
                campoNuevo.focus();
            } else {
                campoNuevo.style.display = 'none';
                campoNuevo.required = false;
                campoNuevo.value = '';
            }
        });
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await guardarPartida();
    });
}

function mostrarFormularioPartida(partida = null) {
    const formContainer = document.getElementById('form-partida-container');
    const form = document.getElementById('form-partida');
    const title = document.getElementById('form-partida-title');
    const campoSelect = document.getElementById('partida-campo-select');
    const campoNuevo = document.getElementById('partida-campo-nuevo');
    
    if (partida) {
        // Editar partida
        state.editandoPartidaId = partida.id;
        title.textContent = 'Editar Partida';
        
        // Llenar formulario - Corregir timezone
        const fechaObj = new Date(partida.fecha);
        const year = fechaObj.getFullYear();
        const month = String(fechaObj.getMonth() + 1).padStart(2, '0');
        const day = String(fechaObj.getDate()).padStart(2, '0');
        const fechaLocal = `${year}-${month}-${day}`;
        document.getElementById('partida-fecha').value = fechaLocal;
        document.getElementById('partida-jugador').value = partida.jugador_id;
        
        // Campo
        if (state.campos.some(c => c.nombre === partida.campo)) {
            campoSelect.value = partida.campo;
            campoNuevo.style.display = 'none';
        } else {
            campoSelect.value = '__nuevo__';
            campoNuevo.style.display = 'block';
            campoNuevo.value = partida.campo;
        }
        
        document.getElementById('partida-score-mio').value = partida.score_mio;
        document.getElementById('partida-score-suyo').value = partida.score_suyo;
        document.getElementById('partida-resultado').value = partida.resultado;
        document.getElementById('partida-importe').value = partida.importe;
        document.getElementById('partida-notas').value = partida.notas || '';
        
        // Mostrar sliding
        const slidingClass = getSlidingClass(partida.sliding_usado);
        document.getElementById('sliding-info-display').innerHTML = `
            <span class="sliding-badge ${slidingClass}">${partida.sliding_usado}</span>
        `;
    } else {
        // Nueva partida
        state.editandoPartidaId = null;
        title.textContent = 'Registrar Partida';
        form.reset();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('partida-fecha').value = today;
        campoNuevo.style.display = 'none';
        document.getElementById('sliding-info-display').innerHTML = `
            <span class="sliding-badge">Seleccione un jugador</span>
        `;
    }
    
    formContainer.style.display = 'block';
    formContainer.scrollIntoView({ behavior: 'smooth' });
}

function editarPartida(partidaId) {
    const partida = state.partidas.find(p => p.id === partidaId);
    if (partida) {
        mostrarFormularioPartida(partida);
    }
}

function editarPartidaDesdeHistorico(partidaId) {
    // Cambiar a tab de partidas
    switchTab('partidas');
    // Esperar un momento para que se renderice el tab
    setTimeout(() => {
        editarPartida(partidaId);
    }, 100);
}

function ocultarFormularioPartida() {
    const formContainer = document.getElementById('form-partida-container');
    const form = document.getElementById('form-partida');
    
    formContainer.style.display = 'none';
    form.reset();
    state.editandoPartidaId = null;
}

async function guardarPartida() {
    console.log('🎮 === INICIANDO GUARDADO DE PARTIDA ===');
    const jugadorSelect = document.getElementById('partida-jugador');
    const jugadorId = jugadorSelect.value;
    const jugadorOption = jugadorSelect.options[jugadorSelect.selectedIndex];
    const jugadorNombre = jugadorOption.dataset.nombre;
    const slidingAnterior = jugadorOption.dataset.sliding;
    
    console.log(`👤 Jugador: ${jugadorNombre} (ID: ${jugadorId})`);
    console.log(`📊 Sliding anterior: ${slidingAnterior}`);
    console.log(`✏️  Modo: ${state.editandoPartidaId ? 'EDITAR' : 'NUEVO'}`);
    
    // Obtener campo
    const campoSelect = document.getElementById('partida-campo-select');
    const campoNuevo = document.getElementById('partida-campo-nuevo');
    let campo = '';
    
    if (campoSelect.value === '__nuevo__') {
        campo = campoNuevo.value.trim();
        if (!campo) {
            alert('Por favor ingrese el nombre del nuevo campo');
            return;
        }
    } else {
        campo = campoSelect.value.trim();
        if (!campo) {
            alert('Por favor seleccione un campo');
            return;
        }
    }
    
    const resultado = document.getElementById('partida-resultado').value;
    
    // Calcular nuevo sliding
    const gano = resultado === 'Ganado';
    const slidingNuevo = ajustarSliding(slidingAnterior, gano);
    
    // CORREGIR BUG FECHA - Usar fecha local sin conversión UTC
    const fechaInput = document.getElementById('partida-fecha').value; // YYYY-MM-DD
    const [year, month, day] = fechaInput.split('-').map(Number);
    const fechaLocal = new Date(year, month - 1, day, 12, 0, 0); // Mediodía local
    
    const partidaData = {
        fecha: fechaLocal.getTime(),
        campo: campo,
        jugador_id: jugadorId,
        jugador_nombre: jugadorNombre,
        sliding_usado: slidingAnterior,
        sliding_anterior: slidingAnterior,
        sliding_nuevo: slidingNuevo,
        score_mio: parseInt(document.getElementById('partida-score-mio').value),
        score_suyo: parseInt(document.getElementById('partida-score-suyo').value),
        resultado: resultado,
        importe: parseFloat(document.getElementById('partida-importe').value),
        notas: document.getElementById('partida-notas').value.trim()
    };
    
    try {
        if (state.editandoPartidaId) {
            // Editar partida existente
            const response = await fetch(`tables/partidas/${state.editandoPartidaId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(partidaData)
            });
            
            if (!response.ok) throw new Error('Error al actualizar partida');
            
            mostrarMensaje('Partida actualizada exitosamente', 'success');
        } else {
            // Crear nueva partida
            const response = await fetch('tables/partidas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(partidaData)
            });
            
            if (!response.ok) throw new Error('Error al crear partida');
            
            // Actualizar sliding del jugador con error handling
            console.log(`🎯 Actualizando sliding: ${slidingAnterior} → ${slidingNuevo} para jugador ${jugadorId}`);
            const updateResponse = await fetch(`tables/jugadores/${jugadorId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sliding_actual: slidingNuevo })
            });
            
            if (!updateResponse.ok) {
                console.error('❌ Error al actualizar sliding del jugador');
                throw new Error('Error al actualizar sliding del jugador');
            }
            
            console.log(`✅ Sliding actualizado exitosamente: ${slidingAnterior} → ${slidingNuevo}`);
            mostrarMensaje(`Partida registrada. Sliding actualizado: ${slidingAnterior} → ${slidingNuevo}`, 'success');
        }
        
        // Guardar campo si es nuevo
        if (campo) {
            await guardarCampo(campo);
        }
        
        ocultarFormularioPartida();
        await cargarPartidas();
        await cargarJugadores();
    } catch (error) {
        console.error('Error:', error);
        mostrarMensaje('Error al guardar partida', 'error');
    }
}

async function cargarPartidas() {
    try {
        console.log('📥 Cargando partidas desde la base de datos...');
        const response = await fetch('tables/partidas?limit=1000&sort=-fecha');
        const data = await response.json();
        
        // Filter out soft-deleted records (if API returns them)
        const allPartidas = data.data || [];
        state.partidas = allPartidas.filter(p => !p.deleted);
        
        const deletedCount = allPartidas.length - state.partidas.length;
        if (deletedCount > 0) {
            console.log(`🗑️ ${deletedCount} partidas eliminadas filtradas`);
        }
        
        console.log(`✅ ${state.partidas.length} partidas activas cargadas`);
        
        // Debug: Mostrar partidas de ABB si existen
        const partidasABB = state.partidas.filter(p => p.jugador_nombre && p.jugador_nombre.toLowerCase().includes('abb'));
        if (partidasABB.length > 0) {
            console.log(`💰 Partidas de ABB encontradas:`, partidasABB.length);
            partidasABB.forEach(p => {
                console.log(`  - ${new Date(p.fecha).toLocaleDateString()}: ${p.resultado}, $${p.importe}, jugador_id: ${p.jugador_id}`);
            });
        }
        
        renderizarPartidas();
    } catch (error) {
        console.error('Error al cargar partidas:', error);
        mostrarMensaje('Error al cargar partidas', 'error');
    }
}

async function limpiarPartidasHuerfanas() {
    try {
        console.log('🧹 Verificando partidas huérfanas...');
        
        // Get all active player IDs
        const jugadorIds = new Set(state.jugadores.map(j => String(j.id)));
        console.log(`📊 ${jugadorIds.size} jugadores activos en el sistema`);
        
        // Find orphaned partidas (games with no matching player)
        const partidasHuerfanas = state.partidas.filter(p => {
            const jugadorIdStr = String(p.jugador_id);
            const isOrphaned = !jugadorIds.has(jugadorIdStr);
            if (isOrphaned) {
                console.log(`🔍 Partida huérfana encontrada:`, {
                    id: p.id,
                    fecha: new Date(p.fecha).toLocaleDateString(),
                    jugador_id: p.jugador_id,
                    jugador_nombre: p.jugador_nombre,
                    importe: p.importe
                });
            }
            return isOrphaned;
        });
        
        if (partidasHuerfanas.length === 0) {
            console.log('✅ No hay partidas huérfanas');
            return;
        }
        
        console.log(`⚠️ Encontradas ${partidasHuerfanas.length} partidas huérfanas. Eliminando...`);
        
        // Delete each orphaned partida
        let eliminadas = 0;
        let errores = 0;
        
        for (const partida of partidasHuerfanas) {
            try {
                console.log(`  🗑️ Eliminando partida huérfana: ${partida.id}`);
                const response = await fetch(`tables/partidas/${partida.id}`, {
                    method: 'DELETE'
                });
                
                if (response.ok || response.status === 204) {
                    eliminadas++;
                    console.log(`    ✅ Eliminada: ${new Date(partida.fecha).toLocaleDateString()} - ${partida.jugador_nombre}`);
                } else {
                    errores++;
                    console.error(`    ❌ Error: Status ${response.status}`);
                }
            } catch (error) {
                errores++;
                console.error(`    ❌ Error al eliminar:`, error);
            }
        }
        
        console.log(`📊 Limpieza completa: ${eliminadas} eliminadas, ${errores} errores`);
        
        if (eliminadas > 0) {
            // Reload partidas to reflect changes
            await cargarPartidas();
            mostrarMensaje(`${eliminadas} partida(s) huérfana(s) eliminada(s)`, 'success');
        }
        
    } catch (error) {
        console.error('❌ Error en limpieza de partidas huérfanas:', error);
    }
}

function renderizarPartidas() {
    const tbody = document.getElementById('partidas-tbody');
    
    // Aplicar filtros
    let partidasFiltradas = filtrarPartidas();
    
    // Aplicar sorting
    partidasFiltradas = ordenarPartidas(partidasFiltradas);
    
    if (partidasFiltradas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px;">
                    <div class="empty-state">
                        <i class="fas fa-clipboard-list"></i>
                        <h3>No hay partidas registradas</h3>
                        <p>Comienza registrando tu primera partida</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = partidasFiltradas.map(partida => {
        const fecha = new Date(partida.fecha);
        const fechaStr = fecha.toLocaleDateString('es-ES');
        
        const resultadoClass = partida.resultado === 'Ganado' ? 'ganado' : 'perdido';
        const importeClass = partida.resultado === 'Ganado' ? 'importe-positivo' : 'importe-negativo';
        const importePrefix = partida.resultado === 'Ganado' ? '+' : '-';
        
        const slidingClass = getSlidingClass(partida.sliding_usado);
        
        // Indicador de cambio de sliding
        let slidingChange = '';
        if (partida.sliding_nuevo && partida.sliding_anterior !== partida.sliding_nuevo) {
            const cambio = parseSliding(partida.sliding_nuevo) - parseSliding(partida.sliding_anterior);
            const cambioIcon = cambio > 0 ? '↑' : '↓';
            const cambioClass = cambio > 0 ? 'up' : 'down';
            slidingChange = `<span class="sliding-change ${cambioClass}">${cambioIcon} ${partida.sliding_nuevo}</span>`;
        }
        
        return `
            <tr>
                <td>${fechaStr}</td>
                <td><i class="fas fa-flag-checkered"></i> ${partida.campo || 'N/A'}</td>
                <td><strong>${partida.jugador_nombre}</strong></td>
                <td><span class="sliding-badge ${slidingClass}">${partida.sliding_usado}</span></td>
                <td>${partida.score_mio} - ${partida.score_suyo}</td>
                <td>
                    <span class="resultado-badge ${resultadoClass}">
                        ${partida.resultado}
                    </span>
                    ${slidingChange}
                </td>
                <td class="${importeClass}">
                    ${importePrefix}$${parseFloat(partida.importe || 0).toFixed(2)}
                </td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn btn-primary btn-small" onclick="event.stopPropagation(); editarPartida('${partida.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-small" onclick="event.stopPropagation(); eliminarPartida('${partida.id}')" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function eliminarPartida(partidaId) {
    if (!confirm('⚠️ ADVERTENCIA: Eliminar esta partida puede descuadrar el sliding. ¿Estás seguro?')) {
        return;
    }
    
    try {
        const response = await fetch(`tables/partidas/${partidaId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Error al eliminar partida');
        
        mostrarMensaje('Partida eliminada. Revisa los slidings manualmente.', 'success');
        await cargarPartidas();
    } catch (error) {
        console.error('Error:', error);
        mostrarMensaje('Error al eliminar partida', 'error');
    }
}

// ==================== FILTROS ====================
function setupFiltros() {
    const filterJugador = document.getElementById('filter-jugador');
    const filterCampo = document.getElementById('filter-campo');
    const filterResultado = document.getElementById('filter-resultado');
    const filterFechaDesde = document.getElementById('filter-fecha-desde');
    const filterFechaHasta = document.getElementById('filter-fecha-hasta');
    const btnLimpiar = document.getElementById('btn-limpiar-filtros');
    const sortPartidas = document.getElementById('sort-partidas');
    
    filterJugador.addEventListener('change', () => {
        state.filtros.jugador = filterJugador.value;
        renderizarPartidas();
    });
    
    filterCampo.addEventListener('change', () => {
        state.filtros.campo = filterCampo.value;
        renderizarPartidas();
    });
    
    filterResultado.addEventListener('change', () => {
        state.filtros.resultado = filterResultado.value;
        renderizarPartidas();
    });
    
    filterFechaDesde.addEventListener('change', () => {
        state.filtros.fechaDesde = filterFechaDesde.value;
        renderizarPartidas();
    });
    
    filterFechaHasta.addEventListener('change', () => {
        state.filtros.fechaHasta = filterFechaHasta.value;
        renderizarPartidas();
    });
    
    // Sorting
    if (sortPartidas) {
        sortPartidas.addEventListener('change', () => {
            state.sortPartidas = sortPartidas.value;
            renderizarPartidas();
        });
    }
    
    btnLimpiar.addEventListener('click', () => {
        state.filtros = {
            jugador: '',
            campo: '',
            resultado: '',
            fechaDesde: '',
            fechaHasta: ''
        };
        filterJugador.value = '';
        filterCampo.value = '';
        filterResultado.value = '';
        filterFechaDesde.value = '';
        filterFechaHasta.value = '';
        renderizarPartidas();
    });
}

function filtrarPartidas() {
    let partidas = [...state.partidas];
    
    if (state.filtros.jugador) {
        partidas = partidas.filter(p => p.jugador_id === state.filtros.jugador);
    }
    
    if (state.filtros.campo) {
        partidas = partidas.filter(p => p.campo === state.filtros.campo);
    }
    
    if (state.filtros.resultado) {
        partidas = partidas.filter(p => p.resultado === state.filtros.resultado);
    }
    
    if (state.filtros.fechaDesde) {
        const desde = new Date(state.filtros.fechaDesde).getTime();
        partidas = partidas.filter(p => p.fecha >= desde);
    }
    
    if (state.filtros.fechaHasta) {
        const hasta = new Date(state.filtros.fechaHasta).getTime() + 86400000; // +1 día
        partidas = partidas.filter(p => p.fecha < hasta);
    }
    
    return partidas;
}

function ordenarPartidas(partidas) {
    const sortField = state.sortPartidas;
    const desc = sortField.startsWith('-');
    const field = desc ? sortField.substring(1) : sortField;
    
    return [...partidas].sort((a, b) => {
        let valA, valB;
        
        switch(field) {
            case 'fecha':
                valA = a.fecha;
                valB = b.fecha;
                break;
            case 'jugador':
                valA = (a.jugador_nombre || '').toLowerCase();
                valB = (b.jugador_nombre || '').toLowerCase();
                break;
            case 'campo':
                valA = (a.campo || '').toLowerCase();
                valB = (b.campo || '').toLowerCase();
                break;
            case 'importe':
                // Para importe, considerar positivo/negativo según resultado
                valA = a.resultado === 'Ganado' ? parseFloat(a.importe || 0) : -parseFloat(a.importe || 0);
                valB = b.resultado === 'Ganado' ? parseFloat(b.importe || 0) : -parseFloat(b.importe || 0);
                break;
            default:
                return 0;
        }
        
        // Comparar valores
        if (typeof valA === 'string') {
            return desc ? valB.localeCompare(valA, 'es') : valA.localeCompare(valB, 'es');
        } else {
            return desc ? valB - valA : valA - valB;
        }
    });
}

function actualizarFiltroJugadores() {
    const select = document.getElementById('filter-jugador');
    select.innerHTML = '<option value="">Todos los jugadores</option>' +
        state.jugadores.map(jugador => 
            `<option value="${jugador.id}">${jugador.nombre}</option>`
        ).join('');
}

function actualizarFiltroCampos() {
    const select = document.getElementById('filter-campo');
    select.innerHTML = '<option value="">Todos los campos</option>' +
        state.campos.map(campo => 
            `<option value="${campo.nombre}">${campo.nombre}</option>`
        ).join('');
}

// ==================== ANALÍTICA ====================
function setupAnalitica() {
    const btnVolver = document.getElementById('btn-volver-general');
    const statCards = document.querySelectorAll('.stat-card');
    const btnLimpiarFiltrosAnalitica = document.getElementById('btn-limpiar-filtros-analitica');
    
    btnVolver.addEventListener('click', () => {
        mostrarAnaliticaGeneral();
    });
    
    // Auto-scroll al ranking cuando se hace click en las stat-cards
    statCards.forEach(card => {
        card.addEventListener('click', () => {
            const rankingSection = document.querySelector('.ranking-section');
            if (rankingSection) {
                rankingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
    
    // Setup filtros de analítica
    document.getElementById('analitica-filter-jugador').addEventListener('change', aplicarFiltrosAnalitica);
    document.getElementById('analitica-filter-campo').addEventListener('change', aplicarFiltrosAnalitica);
    document.getElementById('analitica-filter-fecha-desde').addEventListener('change', aplicarFiltrosAnalitica);
    document.getElementById('analitica-filter-fecha-hasta').addEventListener('change', aplicarFiltrosAnalitica);
    
    if (btnLimpiarFiltrosAnalitica) {
        btnLimpiarFiltrosAnalitica.addEventListener('click', () => {
            document.getElementById('analitica-filter-jugador').value = '';
            document.getElementById('analitica-filter-campo').value = '';
            document.getElementById('analitica-filter-fecha-desde').value = '';
            document.getElementById('analitica-filter-fecha-hasta').value = '';
            state.filtrosAnalitica = { jugador: '', campo: '', fechaDesde: '', fechaHasta: '' };
            aplicarFiltrosAnalitica();
        });
    }
}

function aplicarFiltrosAnalitica() {
    state.filtrosAnalitica.jugador = document.getElementById('analitica-filter-jugador').value;
    state.filtrosAnalitica.campo = document.getElementById('analitica-filter-campo').value;
    state.filtrosAnalitica.fechaDesde = document.getElementById('analitica-filter-fecha-desde').value;
    state.filtrosAnalitica.fechaHasta = document.getElementById('analitica-filter-fecha-hasta').value;
    actualizarAnalitica();
}

function actualizarFiltrosAnalitica() {
    // Actualizar dropdown de jugadores
    const selectJugador = document.getElementById('analitica-filter-jugador');
    const jugadoresOrdenados = [...state.jugadores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    selectJugador.innerHTML = '<option value="">Todos los jugadores</option>' +
        jugadoresOrdenados.map(j => `<option value="${j.id}">${j.nombre}</option>`).join('');
    
    // Actualizar dropdown de campos
    const selectCampo = document.getElementById('analitica-filter-campo');
    const camposOrdenados = [...state.campos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    selectCampo.innerHTML = '<option value="">Todos los campos</option>' +
        camposOrdenados.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
}

function mostrarAnaliticaGeneral() {
    document.getElementById('analitica-general').style.display = 'block';
    document.getElementById('analitica-jugador').style.display = 'none';
    document.getElementById('btn-volver-general').style.display = 'none';
    state.jugadorDetalleId = null;
    
    actualizarAnalitica();
}

async function actualizarAnalitica() {
    await cargarPartidas();
    
    // Actualizar dropdowns de filtros
    actualizarFiltrosAnalitica();
    
    // Aplicar filtros
    let partidasFiltradas = [...state.partidas];
    
    if (state.filtrosAnalitica.jugador) {
        partidasFiltradas = partidasFiltradas.filter(p => p.jugador_id === state.filtrosAnalitica.jugador);
    }
    
    if (state.filtrosAnalitica.campo) {
        partidasFiltradas = partidasFiltradas.filter(p => p.campo === state.filtrosAnalitica.campo);
    }
    
    if (state.filtrosAnalitica.fechaDesde) {
        const fechaDesde = new Date(state.filtrosAnalitica.fechaDesde).getTime();
        partidasFiltradas = partidasFiltradas.filter(p => p.fecha >= fechaDesde);
    }
    
    if (state.filtrosAnalitica.fechaHasta) {
        const fechaHasta = new Date(state.filtrosAnalitica.fechaHasta).getTime() + 86400000; // +1 día
        partidasFiltradas = partidasFiltradas.filter(p => p.fecha < fechaHasta);
    }
    
    // Estadísticas generales con partidas filtradas
    const partidasGanadas = partidasFiltradas.filter(p => p.resultado === 'Ganado').length;
    const partidasPerdidas = partidasFiltradas.filter(p => p.resultado === 'Perdido').length;
    const totalPartidas = partidasFiltradas.length;
    
    const balance = partidasFiltradas.reduce((sum, p) => {
        const importe = parseFloat(p.importe) || 0;
        return sum + (p.resultado === 'Ganado' ? importe : -importe);
    }, 0);
    
    const winRate = totalPartidas > 0 ? ((partidasGanadas / totalPartidas) * 100).toFixed(1) : 0;
    
    // Actualizar DOM
    document.getElementById('stat-ganadas').textContent = partidasGanadas;
    document.getElementById('stat-perdidas').textContent = partidasPerdidas;
    document.getElementById('stat-balance').textContent = `$${balance.toFixed(2)}`;
    document.getElementById('stat-winrate').textContent = `${winRate}%`;
    
    // Renderizar gráficas con datos filtrados
    renderizarGraficas(partidasFiltradas);
    
    // Ranking de jugadores con datos filtrados
    renderizarRanking(partidasFiltradas);
}

// Variables globales para las gráficas
let balanceChartInstance = null;
let resultadosChartInstance = null;
let top5ChartInstance = null;

function renderizarGraficas(partidas = null) {
    const partidasData = partidas || state.partidas;
    
    // Destruir gráficas existentes
    if (balanceChartInstance) balanceChartInstance.destroy();
    if (resultadosChartInstance) resultadosChartInstance.destroy();
    if (top5ChartInstance) top5ChartInstance.destroy();
    
    // Gráfica de balance en el tiempo
    renderizarBalanceChart(partidasData);
    
    // Gráfica de distribución de resultados
    renderizarResultadosChart(partidasData);
    
    // Gráfica de top 5 jugadores
    renderizarTop5Chart(partidasData);
}

function renderizarBalanceChart(partidas = null) {
    const ctx = document.getElementById('balanceChart');
    if (!ctx) return;
    
    const partidasData = partidas || state.partidas;
    
    if (partidasData.length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    
    // Ordenar partidas por fecha
    const partidasOrdenadas = [...partidasData].sort((a, b) => a.fecha - b.fecha);
    
    // Calcular balance acumulado
    let balanceAcumulado = 0;
    const labels = [];
    const datos = [];
    const partidasInfo = []; // Información de cada partida para tooltips
    
    // Punto inicial
    labels.push('Inicio');
    datos.push(0);
    partidasInfo.push(null);
    
    partidasOrdenadas.forEach(p => {
        const cambio = p.resultado === 'Ganado' ? parseFloat(p.importe || 0) : -parseFloat(p.importe || 0);
        balanceAcumulado += cambio;
        const fecha = new Date(p.fecha);
        labels.push(fecha.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));
        datos.push(balanceAcumulado);
        partidasInfo.push(p);
    });
    
    balanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Balance Acumulado',
                data: datos,
                borderColor: '#D4AF37',
                backgroundColor: 'rgba(212, 175, 55, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 6,
                pointHoverRadius: 10,
                pointBackgroundColor: datos.map(d => d >= 0 ? '#D4AF37' : '#DC2626'),
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const partida = partidasInfo[index];
                    if (partida) {
                        mostrarDetallePartidaPopup(partida);
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(10, 10, 10, 0.95)',
                    borderColor: '#D4AF37',
                    borderWidth: 2,
                    padding: 14,
                    titleFont: { size: 14, weight: 'bold' },
                    titleColor: '#D4AF37',
                    bodyFont: { size: 13 },
                    bodyColor: '#FFFFFF',
                    bodySpacing: 6,
                    callbacks: {
                        title: (context) => {
                            const index = context[0].dataIndex;
                            if (index === 0) return 'Inicio';
                            const partida = partidasInfo[index];
                            if (!partida) return '';
                            const fecha = new Date(partida.fecha);
                            return fecha.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
                        },
                        label: (context) => `Balance Total: $${context.parsed.y.toFixed(2)}`,
                        afterLabel: (context) => {
                            const index = context.dataIndex;
                            if (index === 0) return '';
                            const partida = partidasInfo[index];
                            if (!partida) return '';
                            const cambio = partida.resultado === 'Ganado' ? parseFloat(partida.importe || 0) : -parseFloat(partida.importe || 0);
                            const prefix = cambio >= 0 ? '+' : '';
                            return [
                                '',
                                `Contrincante: ${partida.jugador_nombre}`,
                                `Campo: ${partida.campo}`,
                                `Resultado: ${partida.resultado}`,
                                `Cambio: ${prefix}$${cambio.toFixed(2)}`,
                                '',
                                '💡 Click para ver detalles'
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 0,
                        font: { size: 11, weight: '500' },
                        color: '#FFFFFF'
                    }
                },
                y: {
                    ticks: {
                        callback: (value) => '$' + value.toFixed(0),
                        font: { size: 12, weight: '500' },
                        color: '#D4AF37'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}

function renderizarResultadosChart(partidas = null) {
    const ctx = document.getElementById('resultadosChart');
    if (!ctx) return;
    
    const partidasData = partidas || state.partidas;
    
    if (partidasData.length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    
    const partidasGanadas = partidasData.filter(p => p.resultado === 'Ganado');
    const partidasPerdidas = partidasData.filter(p => p.resultado === 'Perdido');
    const ganadas = partidasGanadas.length;
    const perdidas = partidasPerdidas.length;
    const total = ganadas + perdidas;
    const dineroGanado = partidasGanadas.reduce((sum, p) => sum + (parseFloat(p.importe) || 0), 0);
    const dineroPerdido = partidasPerdidas.reduce((sum, p) => sum + (parseFloat(p.importe) || 0), 0);
    
    // Center text plugin for doughnut
    const centerTextPlugin = {
        id: 'centerText',
        beforeDraw: (chart) => {
            const { ctx, chartArea: { width, height } } = chart;
            ctx.save();
            
            const centerX = width / 2;
            const centerY = height / 2;
            
            // Total partidas
            ctx.font = 'bold 32px Inter, sans-serif';
            ctx.fillStyle = '#D4AF37';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(total, centerX, centerY - 10);
            
            // Label "PARTIDAS"
            ctx.font = '600 14px Inter, sans-serif';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('PARTIDAS', centerX, centerY + 20);
            
            ctx.restore();
        }
    };
    
    resultadosChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Ganadas', 'Perdidas'],
            datasets: [{
                data: [ganadas, perdidas],
                backgroundColor: ['#D4AF37', '#DC2626'],
                borderWidth: 4,
                borderColor: '#1A1A1A',
                hoverOffset: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        color: '#FFFFFF',
                        font: {
                            size: 16,
                            family: "'Inter', sans-serif",
                            weight: '600'
                        },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const count = data.datasets[0].data[i];
                                    const percent = ((count / total) * 100).toFixed(1);
                                    return {
                                        text: `${label}: ${count} (${percent}%)`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: data.datasets[0].backgroundColor[i],
                                        hidden: false,
                                        index: i,
                                        fontColor: '#FFFFFF'
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 10, 0.95)',
                    borderColor: '#D4AF37',
                    borderWidth: 2,
                    padding: 14,
                    titleFont: { size: 14, weight: 'bold' },
                    titleColor: '#D4AF37',
                    bodyFont: { size: 13 },
                    bodyColor: '#FFFFFF',
                    callbacks: {
                        label: (context) => {
                            const label = context.label || '';
                            const count = context.parsed;
                            const percent = ((count / total) * 100).toFixed(1);
                            const dinero = label === 'Ganadas' ? dineroGanado : dineroPerdido;
                            return [
                                `${label}: ${count} partidas (${percent}%)`,
                                `Dinero: $${dinero.toFixed(2)}`
                            ];
                        }
                    }
                }
            }
        },
        plugins: [centerTextPlugin]
    });
}

function renderizarTop5Chart(partidas = null) {
    const ctx = document.getElementById('top5Chart');
    if (!ctx) return;
    
    const partidasData = partidas || state.partidas;
    
    if (partidasData.length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    
    // Calcular balance por jugador con más stats
    const jugadoresStats = {};
    
    partidasData.forEach(partida => {
        if (!jugadoresStats[partida.jugador_id]) {
            jugadoresStats[partida.jugador_id] = {
                id: partida.jugador_id,
                nombre: partida.jugador_nombre,
                balance: 0,
                partidas: 0,
                ganadas: 0,
                perdidas: 0
            };
        }
        
        jugadoresStats[partida.jugador_id].balance += 
            partida.resultado === 'Ganado' ? partida.importe : -partida.importe;
        jugadoresStats[partida.jugador_id].partidas++;
        if (partida.resultado === 'Ganado') {
            jugadoresStats[partida.jugador_id].ganadas++;
        } else {
            jugadoresStats[partida.jugador_id].perdidas++;
        }
    });
    
    // Top 5 jugadores por balance
    const top5 = Object.values(jugadoresStats)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);
    
    const colores = top5.map(j => j.balance >= 0 ? '#D4AF37' : '#DC2626');
    
    top5ChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top5.map(j => j.nombre),
            datasets: [{
                label: 'Balance',
                data: top5.map(j => j.balance),
                backgroundColor: colores,
                borderRadius: 8,
                hoverBackgroundColor: colores.map(c => c + 'DD')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const jugador = top5[index];
                    if (jugador && jugador.id) {
                        verPerfilJugador(jugador.id);
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 10, 0.95)',
                    borderColor: '#D4AF37',
                    borderWidth: 2,
                    padding: 14,
                    titleFont: { size: 14, weight: 'bold' },
                    titleColor: '#D4AF37',
                    bodyFont: { size: 13 },
                    bodyColor: '#FFFFFF',
                    bodySpacing: 6,
                    callbacks: {
                        label: (context) => {
                            const jugador = top5[context.dataIndex];
                            const winRate = jugador.partidas > 0 ? 
                                ((jugador.ganadas / jugador.partidas) * 100).toFixed(1) : '0';
                            return [
                                `Balance: $${context.parsed.y.toFixed(2)}`,
                                `Partidas: ${jugador.partidas}`,
                                `Ganadas: ${jugador.ganadas}`,
                                `Perdidas: ${jugador.perdidas}`,
                                `Win Rate: ${winRate}%`,
                                '',
                                '💡 Click para ver perfil'
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#FFFFFF',
                        font: {
                            size: 12,
                            weight: '500'
                        }
                    }
                },
                y: {
                    ticks: {
                        callback: (value) => '$' + value,
                        color: '#FFFFFF',
                        font: {
                            size: 12,
                            weight: '500'
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}

function renderizarRanking(partidas = null) {
    const tbody = document.getElementById('ranking-tbody');
    
    const partidasData = partidas || state.partidas;
    
    // Calcular estadísticas por jugador
    const jugadoresStats = {};
    
    partidasData.forEach(partida => {
        const jugadorId = partida.jugador_id;
        
        if (!jugadoresStats[jugadorId]) {
            jugadoresStats[jugadorId] = {
                nombre: partida.jugador_nombre,
                jugador_id: jugadorId,
                partidas: 0,
                ganadas: 0,
                perdidas: 0,
                balance: 0,
                dineroGanado: 0,
                dineroPerdido: 0,
                sliding: ''
            };
            
            // Buscar sliding actual
            const jugador = state.jugadores.find(j => j.id === jugadorId);
            if (jugador) {
                jugadoresStats[jugadorId].sliding = jugador.sliding_actual || jugador.sliding_inicial;
            }
        }
        
        jugadoresStats[jugadorId].partidas++;
        
        const importe = parseFloat(partida.importe) || 0;
        if (partida.resultado === 'Ganado') {
            jugadoresStats[jugadorId].ganadas++;
            jugadoresStats[jugadorId].balance += importe;
            jugadoresStats[jugadorId].dineroGanado += importe;
        } else {
            jugadoresStats[jugadorId].perdidas++;
            jugadoresStats[jugadorId].balance -= importe;
            jugadoresStats[jugadorId].dineroPerdido += importe;
        }
    });
    
    // Convertir a array y ordenar por balance
    const rankingArray = Object.values(jugadoresStats)
        .sort((a, b) => b.balance - a.balance);
    
    if (rankingArray.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px;">
                    <div class="empty-state">
                        <i class="fas fa-chart-bar"></i>
                        <h3>No hay datos para mostrar</h3>
                        <p>Registra partidas para ver estadísticas</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = rankingArray.map((jugador, index) => {
        const posicion = index + 1;
        const posicionClass = posicion === 1 ? 'top1' : posicion === 2 ? 'top2' : posicion === 3 ? 'top3' : '';
        const winRate = jugador.partidas > 0 ? ((jugador.ganadas / jugador.partidas) * 100).toFixed(1) : 0;
        const balanceClass = jugador.balance >= 0 ? 'importe-positivo' : 'importe-negativo';
        const slidingClass = getSlidingClass(jugador.sliding);
        
        return `
            <tr onclick="mostrarDetalleJugador('${jugador.jugador_id}')" style="cursor: pointer;">
                <td>
                    <span class="ranking-position ${posicionClass}">${posicion}</span>
                </td>
                <td><strong>${jugador.nombre}</strong></td>
                <td><span class="sliding-badge ${slidingClass}">${jugador.sliding}</span></td>
                <td>${jugador.partidas}</td>
                <td>${jugador.ganadas}</td>
                <td>${jugador.perdidas}</td>
                <td>${winRate}%</td>
                <td class="${balanceClass}">
                    <strong>$${jugador.balance.toFixed(2)}</strong>
                    <div style="font-size: 0.75rem; color: #666; margin-top: 3px;">
                        <span style="color: #28a745;">+$${jugador.dineroGanado.toFixed(2)}</span> / 
                        <span style="color: #dc3545;">-$${jugador.dineroPerdido.toFixed(2)}</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function mostrarDetalleJugador(jugadorId) {
    state.jugadorDetalleId = jugadorId;
    const jugador = state.jugadores.find(j => j.id === jugadorId);
    
    if (!jugador) return;
    
    // Ocultar vista general, mostrar vista detalle
    document.getElementById('analitica-general').style.display = 'none';
    document.getElementById('analitica-jugador').style.display = 'block';
    document.getElementById('btn-volver-general').style.display = 'inline-flex';
    
    // Obtener partidas del jugador
    const partidasJugador = state.partidas.filter(p => p.jugador_id === jugadorId);
    
    // Calcular estadísticas
    const totalPartidas = partidasJugador.length;
    const ganadas = partidasJugador.filter(p => p.resultado === 'Ganado').length;
    const perdidas = partidasJugador.filter(p => p.resultado === 'Perdido').length;
    const winRate = totalPartidas > 0 ? ((ganadas / totalPartidas) * 100).toFixed(1) : 0;
    const dineroGanado = partidasJugador.filter(p => p.resultado === 'Ganado').reduce((sum, p) => sum + (parseFloat(p.importe) || 0), 0);
    const dineroPerdido = partidasJugador.filter(p => p.resultado === 'Perdido').reduce((sum, p) => sum + (parseFloat(p.importe) || 0), 0);
    const balance = dineroGanado - dineroPerdido;
    
    // Actualizar header
    document.getElementById('detalle-jugador-nombre').textContent = jugador.nombre;
    
    const slidingActual = jugador.sliding_actual || jugador.sliding_inicial;
    const slidingClass = getSlidingClass(slidingActual);
    const slidingNum = parseSliding(slidingActual);
    
    // Actualizar tarjetas de sliding con color dinámico
    document.getElementById('detalle-sliding-actual-valor').textContent = slidingActual;
    document.getElementById('detalle-sliding-inicial-valor').textContent = jugador.sliding_inicial;
    
    const slidingCard = document.getElementById('sliding-actual-info-card');
    slidingCard.classList.remove('sliding-positivo', 'sliding-negativo');
    if (slidingNum > 0) {
        slidingCard.classList.add('sliding-positivo');
    } else if (slidingNum < 0) {
        slidingCard.classList.add('sliding-negativo');
    }
    
    // Mostrar u ocultar notas
    const notasSection = document.getElementById('detalle-notas-section');
    const notasText = document.getElementById('detalle-notas-text');
    if (jugador.notas && jugador.notas.trim()) {
        notasSection.style.display = 'block';
        notasText.textContent = jugador.notas;
    } else {
        notasSection.style.display = 'none';
    }
    
    // Actualizar stats compactas (sin sliding, ya está en tarjetas)
    document.getElementById('detalle-total-partidas').textContent = totalPartidas;
    document.getElementById('detalle-ganadas').textContent = ganadas;
    document.getElementById('detalle-perdidas').textContent = perdidas;
    document.getElementById('detalle-winrate').textContent = `${winRate}%`;
    
    // Actualizar balance detallado
    document.getElementById('detalle-dinero-ganado').textContent = `$${dineroGanado.toFixed(2)}`;
    document.getElementById('detalle-dinero-perdido').textContent = `$${dineroPerdido.toFixed(2)}`;
    document.getElementById('detalle-balance-neto').textContent = `${balance >= 0 ? '+' : ''}$${balance.toFixed(2)}`;
    document.getElementById('detalle-balance-texto').textContent = balance >= 0 ? 'GANADO' : 'PERDIDO';
    
    // Renderizar histórico
    renderizarHistorico(partidasJugador);
}

function renderizarHistorico(partidas) {
    const tbody = document.getElementById('historico-tbody');
    
    // Ordenar por fecha descendente (más reciente primero)
    const partidasOrdenadas = [...partidas].sort((a, b) => b.fecha - a.fecha);
    
    tbody.innerHTML = partidasOrdenadas.map(partida => {
        const fecha = new Date(partida.fecha);
        const fechaStr = fecha.toLocaleDateString('es-ES');
        
        const resultadoClass = partida.resultado === 'Ganado' ? 'ganado' : 'perdido';
        const importeClass = partida.resultado === 'Ganado' ? 'importe-positivo' : 'importe-negativo';
        const importePrefix = partida.resultado === 'Ganado' ? '+' : '-';
        
        const slidingClass = getSlidingClass(partida.sliding_usado);
        
        // Cambio de sliding
        let slidingCambio = '<span class="sliding-change same">—</span>';
        if (partida.sliding_nuevo && partida.sliding_anterior !== partida.sliding_nuevo) {
            const cambio = parseSliding(partida.sliding_nuevo) - parseSliding(partida.sliding_anterior);
            const cambioIcon = cambio > 0 ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';
            const cambioClass = cambio > 0 ? 'up' : 'down';
            slidingCambio = `
                <span class="sliding-change ${cambioClass}">
                    ${cambioIcon} ${partida.sliding_nuevo}
                </span>
            `;
        }
        
        return `
            <tr class="partida-row">
                <td><strong>${fechaStr}</strong></td>
                <td><i class="fas fa-flag-checkered" style="color: var(--primary-color);"></i> ${partida.campo || 'N/A'}</td>
                <td><span class="sliding-badge ${slidingClass}">${partida.sliding_usado}</span></td>
                <td><strong>${partida.score_mio} - ${partida.score_suyo}</strong></td>
                <td>
                    <span class="resultado-badge ${resultadoClass}">
                        ${partida.resultado}
                    </span>
                </td>
                <td class="${importeClass}">
                    <strong>${importePrefix}$${parseFloat(partida.importe || 0).toFixed(2)}</strong>
                </td>
                <td>${slidingCambio}</td>
                <td>
                    <div style="display: flex; gap: 4px; justify-content: center;">
                        <button class="btn btn-primary btn-small" onclick="event.stopPropagation(); editarPartidaDesdeHistorico('${partida.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); mostrarDetallePartida('${partida.id}')" title="Ver detalle">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function mostrarDetallePartida(partidaId) {
    const partida = state.partidas.find(p => p.id === partidaId);
    if (!partida) return;
    
    const fecha = new Date(partida.fecha).toLocaleDateString('es-ES', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    const slidingCambio = partida.sliding_nuevo ? 
        `${partida.sliding_anterior} → ${partida.sliding_nuevo}` : 
        partida.sliding_usado;
    
    const mensaje = `
📅 Fecha: ${fecha}
⛳ Campo: ${partida.campo || 'N/A'}
👤 Jugador: ${partida.jugador_nombre}
📊 Sliding: ${slidingCambio}
🎯 Marcador: ${partida.score_mio} - ${partida.score_suyo}
${partida.resultado === 'Ganado' ? '🏆' : '❌'} Resultado: ${partida.resultado}
💰 Importe: $${partida.importe.toFixed(2)}
${partida.notas ? `📝 Notas: ${partida.notas}` : ''}
    `.trim();
    
    alert(mensaje);
}

// ==================== UTILIDADES ====================
function mostrarMensaje(mensaje, tipo) {
    // Simple alert por ahora - se puede mejorar con un toast notification
    if (tipo === 'success') {
        alert('✓ ' + mensaje);
    } else {
        alert('✗ ' + mensaje);
    }
}

function mostrarDetallePartidaPopup(partida) {
    const fecha = new Date(partida.fecha);
    const fechaStr = fecha.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    const cambio = partida.resultado === 'Ganado' ? partida.importe : -partida.importe;
    const prefix = cambio >= 0 ? '+' : '';
    
    const mensaje = `
📅 DETALLE DE PARTIDA
━━━━━━━━━━━━━━━━━━━━

📆 Fecha: ${fechaStr}
⛳ Campo: ${partida.campo}
👤 Contrincante: ${partida.jugador_nombre}
📊 Sliding Usado: ${partida.sliding_usado}

🎯 MARCADOR
   Tu Score: ${partida.score_mio}
   Score Contrincante: ${partida.score_suyo}

${partida.resultado === 'Ganado' ? '🏆' : '❌'} Resultado: ${partida.resultado}
💰 Importe: ${prefix}$${Math.abs(cambio).toFixed(2)}

${partida.sliding_nuevo ? `📈 Nuevo Sliding: ${partida.sliding_nuevo}` : ''}
${partida.notas ? `\n📝 Notas: ${partida.notas}` : ''}

💡 Para editar esta partida, ve a la tabla de histórico
    `.trim();
    
    alert(mensaje);
}

// Funciones globales para los event handlers inline
window.editarJugador = editarJugador;
window.eliminarJugador = eliminarJugador;
window.eliminarPartida = eliminarPartida;
window.mostrarDetalleJugador = mostrarDetalleJugador;
window.nuevaPartidaConJugador = nuevaPartidaConJugador;

// DEBUG: Función global para diagnosticar problemas
window.debugABB = function() {
    console.log('🔍 === DEBUG ABB ===');
    
    // Buscar jugador ABB
    const jugadorABB = state.jugadores.find(j => j.nombre && j.nombre.toLowerCase().includes('abb'));
    if (jugadorABB) {
        console.log('👤 Jugador ABB encontrado:', jugadorABB);
    } else {
        console.log('❌ No se encontró jugador ABB en state.jugadores');
        console.log('Jugadores disponibles:', state.jugadores.map(j => j.nombre));
        return;
    }
    
    // Buscar partidas del jugador
    const partidasABB = state.partidas.filter(p => p.jugador_id === jugadorABB.id);
    console.log(`💰 Partidas de ABB (${partidasABB.length}):`, partidasABB);
    
    // Calcular balance
    const balance = partidasABB.reduce((sum, p) => {
        const importe = parseFloat(p.importe) || 0;
        return sum + (p.resultado === 'Ganado' ? importe : -importe);
    }, 0);
    console.log('💵 Balance calculado:', balance);
    
    // Verificar todas las partidas en el sistema
    console.log(`📊 Total de partidas en el sistema: ${state.partidas.length}`);
    console.log('Primeras 5 partidas:', state.partidas.slice(0, 5));
    
    return {
        jugador: jugadorABB,
        partidas: partidasABB,
        balance: balance,
        totalPartidas: state.partidas.length
    };
};
