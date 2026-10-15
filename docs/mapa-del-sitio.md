# Mapa del sitio

Copia versionada del diagrama editable en FigJam: https://www.figma.com/board/aByZhh0xM4F626XPdWcg7Y (el v2 está al lado del original).
GitHub muestra este diagrama renderizado. Si cambia la estructura, actualizar los dos.

Portada: la clínica (pacientes). Desde ahí salen el alquiler para profesionales, la tienda de insumos y los turnos.
Amarillo: insumos, nuevo. Verde: turnos, ya existía. Gris: sitio de Nati, se arma en otro hilo.

| Ruta | Página |
|---|---|
| `/` | Portada de la clínica para pacientes |
| `/profesionales/` | Alquiler de consultorio |
| `/insumos/` | Catálogo y pedido de insumos (por WhatsApp) |
| `/turnos/` | Reserva de pacientes, panel de profesionales y admin |
| `/nati/` | Sitio de Nati (ruta reservada, otro hilo) |

```mermaid
flowchart LR
    dominio(["Consultorios Dina Huapi (inicio)"])

    subgraph s1 ["1. Pacientes: portada de la clínica"]
        c1Trat["Tratamientos"]
        c1Equipo["Equipo"]
        c1Lugar["El consultorio y bioseguridad"]
        c1Ubic["Ubicación, horarios y obras sociales"]
        c1Faq["Preguntas frecuentes"]
    end

    subgraph s2 ["2. Para profesionales: alquiler"]
        p2Mod["Modalidades: prueba, medio día, día completo"]
        p2Incl["Qué incluye y equipamiento"]
        p2Comp["Comparativa propio o compartido"]
        p2Visita["Pedir visita"]
    end

    subgraph s3 ["3. Insumos: venta a profesionales"]
        i3Cat["Catálogo por categoría y búsqueda"]
        i3Pedido["Pedido: cantidades, variantes, matrícula"]
        i3Entrega{"¿Retiro o envío?"}
    end

    subgraph s4 ["4. Sistema de turnos"]
        t4Reserva["Reserva online de pacientes (sin login)"]
        t4Cancel["Ver o cancelar turno"]
        t4Login["Login profesionales (link al mail)"]
        t4Agenda["Agenda, calendario y perfil"]
    end

    subgraph s5 ["5. Sitio de Nati (otro hilo)"]
        n5Home["Inicio Nati"]
    end

    wa[/"WhatsApp de la clínica"/]
    db[("Supabase: base y login")]
    gcal[/"Google Calendar"/]

    dominio --> c1Trat & c1Equipo & c1Lugar & c1Ubic & c1Faq
    dominio -->|"Pedir turno"| t4Reserva
    dominio -->|"Trabajá con nosotros"| p2Mod
    dominio -->|"Trabajá con nosotros"| i3Cat
    c1Equipo -->|"Ficha de Nati"| n5Home
    n5Home -->|"Link directo con Nati"| t4Reserva

    p2Mod --> p2Incl --> p2Comp --> p2Visita
    p2Visita -.->|"Mensaje armado"| wa
    p2Incl -->|"Descartables"| i3Cat
    p2Mod -->|"Agenda incluida"| t4Login

    i3Cat --> i3Pedido --> i3Entrega
    i3Entrega -.->|"Pedido armado"| wa

    t4Reserva -->|"Link personal"| t4Cancel
    t4Login --> t4Agenda
    t4Reserva --> db
    t4Agenda --> db
    t4Agenda -.->|"Feed de turnos"| gcal

    style s1 fill:#E8F1F3,stroke:#127285
    style s2 fill:#E8F1F3,stroke:#127285
    style s3 fill:#FFECBD,stroke:#FFC943
    style s4 fill:#CDF4D3,stroke:#66D575
    style s5 fill:#F4F7F8,stroke:#D5DDE2
```
