# HyperDB

**HyperDB** es una base de datos NoSQL de alto rendimiento y particionamiento automático (sharding) para Node.js. 

Su filosofía es simple: **Interactúa con tu base de datos exactamente igual que con un objeto de JavaScript.** Gracias a su arquitectura basada en Proxies transparentes, LMDB (VaultEngine) y cachés LRU (Memory Arenas), HyperDB guarda, particiona y recupera tus datos en binario a velocidades extremas sin que tengas que escribir una sola consulta manual.

---

## Características Principales

- **Persistencia Transparente:** Usa `db.data.prop = "valor"` y se guardará en disco automáticamente.
- **Auto-Sharding (ShardMatrix):** Los objetos anidados se separan automáticamente en archivos binarios independientes (`.node.bin` y `.map.bin`). Cargar la raíz no carga toda la base de datos en RAM.
- **Lazy Commits (WriteBuffer):** Las escrituras se agrupan en lotes (debounce) para no saturar el I/O del disco.
- **Motor LMDB:** Lecturas y escrituras atómicas ultrarrápidas y seguras.
- **Funciones Almacenables:** Puedes guardar funciones de JS directamente en la base de datos y ejecutarlas después.

---

## $ Instalación

Requiere **Node.js >= 18.0.0**.

```bash
npm install @syllkom/hyper-db
```

---

## Uso Básico

Olvídate de los `INSERT`, `SELECT` o `UPDATE`. En HyperDB todo es un objeto.

```javascript
import { HyperDB } from '@syllkom/hyper-db';

// 1. Inicializar el motor
const db = new HyperDB({
    folder: './db_data', // Carpeta donde se guardará la DB
    memory: 50           // Límite de la Arena de Memoria en MB
});

// 2. Escribir datos (Se guarda en disco automáticamente en segundo plano)
db.data.nombre = "Servidor Alfa";
db.data.config = {
    puerto: 8080,
    mantenimiento: false
};

// 3. Leer datos (Se lee desde la Memory Arena o el disco instantáneamente)
console.log(db.data.config.puerto); // 8080
```

---

## Conceptos Avanzados y Prácticas

### 1. Auto-Sharding (Fragmentación Automática)
Cuando asignas un objeto a una propiedad, HyperDB crea un nuevo "Shard" (fragmento). Esto significa que la base de datos nunca carga todo a la vez.

```javascript
// Esto crea un nodo raíz
db.data.usuarios = {}; 

// Esto crea un sub-shard solo para "alice".
// Leer la lista de usuarios NO cargará todo el perfil de Alice en RAM.
db.data.usuarios.alice = { 
    edad: 28, 
    rol: "admin", 
    inventario: ["espada", "escudo"] 
};
```

### 2. Navegación Profunda (`navigate`)
Si tienes una estructura muy profunda y no quieres cargar los objetos intermedios, puedes navegar directamente al shard que necesitas:

```javascript
// Va directo al archivo binario de "alice" sin cargar "usuarios" completos
const aliceProxy = db.navigate('usuarios', 'alice');

if (aliceProxy) {
    aliceProxy.edad = 29; // Actualiza directamente su shard
}
```

### 3. Almacenar Funciones
A diferencia de un JSON tradicional o bases de datos comunes, HyperDB soporta la serialización y ejecución de funciones gracias a su `HyperCodec`.

```javascript
db.data.utilidades = {
    saludar: function(nombre) {
        return `Hola, ${nombre}! Bienvenido a HyperDB.`;
    }
};

// Ejecutar la función almacenada
const mensaje = db.data.utilidades.saludar("Zeppth");
console.log(mensaje);
```

### 4. Interceptores de Proxy (Triggers)
Puedes reaccionar a eventos de lectura, escritura o eliminación directamente en la base de datos definiendo "traps" en la propiedad especial `$proxy`.

```javascript
db.data.usuarios.$proxy.define({
    set: function(target, key, value) {
        console.log(`[LOG] Se modificó el usuario: ${key}`);
        
        // Validación de datos antes de guardar
        if (typeof value !== 'object') {
            this.reject(new Error("Un usuario debe ser un objeto"));
            return;
        }

        // Siempre debes resolver con el valor final que deseas guardar
        this.resolve(value);
    }
});

db.data.usuarios.bob = { edad: 30 }; // Imprime: [LOG] Se modificó el usuario: bob
db.data.usuarios.carlos = "Invalido"; // Lanza el Error definido en el reject
```

---

## Configuración del Motor (VaultEngine)

Al instanciar `new HyperDB(config)`, puedes ajustar el rendimiento con las siguientes opciones:

| Parámetro | Tipo | Por defecto | Descripción |
| :--- | :--- | :--- | :--- |
| `folder` | `String` | `'./data'` | Directorio donde se almacenarán los archivos `.bin`. |
| `memory` | `Number` | `50` | Memoria máxima asignada a las Cachés LRU (en Megabytes). |
| `atomic` | `Boolean` | `true` | Habilita operaciones de escritura atómicas en LMDB. |
| `maps.threshold` | `Number` | `10` | Cantidad de escrituras en mapas antes de un guardado forzoso. |
| `maps.debounce` | `Number` | `5000` | Milisegundos a esperar antes de agrupar y guardar mapas (Lazy commit). |
| `nodes.threshold`| `Number` | `10` | Cantidad de escrituras en nodos de estado antes de un guardado. |
| `nodes.debounce` | `Number` | `5000` | Milisegundos a esperar para guardar nodos. |

---

## Métodos de Utilidad

```javascript
// Fuerza a vaciar la caché y sincronizar todo el WriteBuffer al disco inmediatamente
db.flush(); 

// Obtiene estadísticas en vivo de la memoria caché (Arenas)
console.log(db.metrics());
/* Ejemplo de salida:
{
  pointers: { used: '500.00 KB', limit: '5.00 MB', items: 12 },
  nodes: { used: '1.20 MB', limit: '45.00 MB', items: 145 }
}
*/
```

---

## Buenas Prácticas

1. **Evita arrays inmensos:** Debido a la naturaleza de los Proxies en JavaScript, hacer mutaciones continuas en arrays gigantes (ej. `push`, `splice` masivos) es menos eficiente que usar objetos con claves únicas (`{ "id_1": {...}, "id_2": {...} }`).
2. **Aprovecha el debounce:** No uses `db.flush()` manualmente después de cada asignación. Deja que el `WriteBuffer` interno recoja los cambios durante el tiempo configurado (5000ms por defecto) para maximizar la vida útil del disco y el rendimiento.
3. **Mide tu Memoria:** Si vas a operar millones de registros en producción, usa `db.metrics()` para monitorear tu `MemoryArena` y ajusta el límite de MB según el servidor que estés utilizando.