// Datos iniciales de jugadores
const jugadoresIniciales = [
    { nombre: "Aldo", sliding: "+5", notas: "" },
    { nombre: "Alex Tocayo Flores", sliding: "+15", notas: "" },
    { nombre: "Alfonso Marenco", sliding: "+2", notas: "" },
    { nombre: "Arturo Urbiola", sliding: "-5", notas: "" },
    { nombre: "Beto Gutiérrez", sliding: "+15", notas: "" },
    { nombre: "Bernardo Polanco", sliding: "+19", notas: "" },
    { nombre: "Carlos Meléndez", sliding: "+12", notas: "xx" },
    { nombre: "Carlos Minvielle L", sliding: "+12", notas: "" },
    { nombre: "Chris Salcedo", sliding: "+3", notas: "" },
    { nombre: "Dr. German", sliding: "+7", notas: "33" },
    { nombre: "Dr. Montalvo", sliding: "+19", notas: "" },
    { nombre: "Dr. Tito Gutiérrez", sliding: "+12", notas: "" },
    { nombre: "Eduardo Gutiérrez EG", sliding: "-4", notas: "" },
    { nombre: "Eduardo Rosas ERB", sliding: "+21", notas: "30" },
    { nombre: "Emilio Abarca", sliding: "+7", notas: "" },
    { nombre: "Enrique Alarcón", sliding: "0", notas: "" },
    { nombre: "Everardo Espinosa", sliding: "-22", notas: "" },
    { nombre: "Fernando Gómez Pimienta", sliding: "-3", notas: "" },
    { nombre: "Fernando Peña", sliding: "+19", notas: "" },
    { nombre: "Fernando Zabal", sliding: "+11", notas: "" },
    { nombre: "Gilberto Alarcón", sliding: "+6", notas: "" },
    { nombre: "Gustavo Gonzales GGG", sliding: "+15", notas: "" },
    { nombre: "Gustavo Gonzales Jr", sliding: "+4", notas: "" },
    { nombre: "Gustavo O'Farril", sliding: "+11", notas: "" },
    { nombre: "Isaac Memun IME", sliding: "-9", notas: "" },
    { nombre: "Javier Abarca", sliding: "+7", notas: "" },
    { nombre: "Javier Calvillo JCM", sliding: "+8", notas: "" },
    { nombre: "Javier Téllez JTG", sliding: "+10", notas: "31" },
    { nombre: "John Watson", sliding: "+11", notas: "" },
    { nombre: "Jorge Papik JPRR", sliding: "+4", notas: "34" },
    { nombre: "Joseph Memun JMM", sliding: "0", notas: "" },
    { nombre: "Juan Manuel Trujillo", sliding: "+7", notas: "" },
    { nombre: "Juan Salomón", sliding: "+3", notas: "" },
    { nombre: "Luis Rubén", sliding: "-2", notas: "" },
    { nombre: "Mario Abitia", sliding: "+1", notas: "" },
    { nombre: "Miguel Gonzalo", sliding: "+6", notas: "" },
    { nombre: "Miguel Gonzalo jr", sliding: "+14", notas: "" },
    { nombre: "Miguel Lozano MLC", sliding: "+14", notas: "" },
    { nombre: "Orlando Ruanova", sliding: "+3", notas: "2 y ajuste" },
    { nombre: "Paco Carbia", sliding: "+9", notas: "" },
    { nombre: "Paco Valdez", sliding: "+6", notas: "" },
    { nombre: "Pedro Pacheco", sliding: "+12", notas: "" },
    { nombre: "Rafa Rosas", sliding: "-5", notas: "32" },
    { nombre: "Roca", sliding: "+9", notas: "" },
    { nombre: "Rodrigo Ruiz de Teresa", sliding: "+4", notas: "" },
    { nombre: "Rojo", sliding: "+9", notas: "ajustamos dos arriba uno abajo" },
    { nombre: "Sammy Memun", sliding: "0", notas: "" },
    { nombre: "Tomás Varela", sliding: "+10", notas: "" },
    { nombre: "Víctor Fernández", sliding: "-3", notas: "" },
    { nombre: "Víctor López", sliding: "+15", notas: "" },
    { nombre: "Yosi Salame YSH", sliding: "-7", notas: "" }
];

// Función para cargar los datos iniciales
async function cargarJugadoresIniciales() {
    const btnCargar = document.getElementById('btn-cargar-datos');
    
    if (!btnCargar) return;
    
    // Verificar si ya hay jugadores cargados
    try {
        const response = await fetch('tables/jugadores?limit=1');
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            alert('⚠️ Ya hay jugadores cargados en el sistema.\n\nNo es necesario cargar los datos iniciales nuevamente.\n\nSi deseas agregar más jugadores, usa el botón "+ Nuevo".');
            const containerInicial = document.getElementById('carga-inicial-container');
            if (containerInicial) {
                containerInicial.style.display = 'none';
            }
            return;
        }
    } catch (error) {
        console.error('Error al verificar jugadores:', error);
    }
    
    // Confirmar con el usuario
    if (!confirm('¿Estás seguro de cargar los 51 jugadores iniciales?\n\nEsta acción solo debe hacerse la primera vez.')) {
        return;
    }
    
    // Deshabilitar botón durante la carga
    btnCargar.disabled = true;
    btnCargar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    
    try {
        let cargados = 0;
        let errores = 0;
        
        for (const jugador of jugadoresIniciales) {
            try {
                const response = await fetch('tables/jugadores', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nombre: jugador.nombre,
                        sliding_inicial: jugador.sliding,
                        sliding_actual: jugador.sliding,
                        notas: jugador.notas
                    })
                });
                
                if (response.ok) {
                    cargados++;
                } else {
                    errores++;
                }
            } catch (error) {
                console.error(`Error al cargar ${jugador.nombre}:`, error);
                errores++;
            }
        }
        
        // Recargar la lista de jugadores
        await cargarJugadores();
        
        // Ocultar permanentemente el botón de carga inicial
        const containerInicial = document.getElementById('carga-inicial-container');
        if (containerInicial) {
            containerInicial.style.display = 'none';
        }
        
        alert(`✓ Datos cargados exitosamente!\n\nJugadores cargados: ${cargados}\nErrores: ${errores}`);
        
    } catch (error) {
        console.error('Error al cargar datos iniciales:', error);
        alert('✗ Error al cargar datos iniciales');
        btnCargar.disabled = false;
        btnCargar.innerHTML = '<i class="fas fa-download"></i> Cargar 51 Jugadores';
    }
}

// El event listener ya está en app.js, no duplicar
