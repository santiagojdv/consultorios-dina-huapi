# Mapa del sitio

Copia versionada del diagrama editable en FigJam: https://www.figma.com/board/aByZhh0xM4F626XPdWcg7Y (la versión más nueva es la de más a la derecha).
GitHub muestra este diagrama renderizado. Si cambia la estructura, actualizar los dos.

Portada: la clínica (pacientes). Desde ahí salen el alquiler para profesionales, los turnos y el sitio de Nati.
Verde: va online en el lanzamiento. Gris punteado: insumos, offline por ahora (el código queda en `insumos/`, sin links).

| Ruta | Página |
|---|---|
| `/` | Portada de la clínica para pacientes |
| `/profesionales/` | Alquiler de consultorio |
| `/insumos/` | Catálogo y pedido de insumos (offline por ahora) |
| `/turnos/` | Reserva de pacientes, panel de profesionales y admin |
| `/nati/` | Sitio de Nati |

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

    subgraph s3 ["3. Insumos: OFFLINE por ahora"]
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

    subgraph s6 ["6. Otros profesionales del equipo"]
        o6Ficha["Ficha en Equipo (sale de su perfil en la agenda)"]
        o6Web["Su sitio web (opcional)"]
    end

    subgraph s5 ["5. Sitio de Nati (/nati/)"]
        n5Home["Inicio Nati"]
        n5Trat["Tratamientos, alineadores y estética facial"]
        n5Sobre["Primera consulta y sobre Natalia"]
        n5Cta["Pedir turno con Nati"]
    end

    wa[/"WhatsApp de la clínica"/]
    waNati[/"WhatsApp de Nati"/]
    db[("Supabase: base y login")]
    gcal[/"Google Calendar"/]

    dominio --> c1Trat & c1Equipo & c1Lugar & c1Ubic & c1Faq
    dominio -->|"Pedir turno"| t4Reserva
    dominio -->|"Trabajá con nosotros"| p2Mod
    dominio -->|"Agenda online"| t4Login
    c1Equipo -->|"Ficha de Nati"| n5Home
    c1Equipo -->|"Una ficha por profesional"| o6Ficha
    o6Ficha -->|"Sacar turno"| t4Reserva
    o6Ficha -.->|"Conocer su trabajo"| o6Web
    t4Agenda -.->|"Mi perfil"| o6Ficha
    n5Home --> n5Trat & n5Sobre & n5Cta
    n5Cta -->|"Reserva online"| t4Reserva
    n5Cta -.->|"Consulta"| waNati
    n5Home -.->|"Volver a la clínica"| dominio

    p2Mod --> p2Incl --> p2Comp --> p2Visita
    p2Visita -.->|"Mensaje armado"| wa
    p2Mod -->|"Agenda incluida"| t4Login

    i3Cat --> i3Pedido --> i3Entrega
    i3Entrega -.->|"Pedido armado"| wa

    t4Reserva -->|"Link personal"| t4Cancel
    t4Login --> t4Agenda
    t4Reserva --> db
    t4Agenda --> db
    t4Agenda -.->|"Feed de turnos"| gcal

    style s1 fill:#CDF4D3,stroke:#66D575
    style s2 fill:#CDF4D3,stroke:#66D575
    style s3 fill:#EEEEEE,stroke:#B5B5B5,stroke-dasharray: 5 5
    style s4 fill:#CDF4D3,stroke:#66D575
    style s5 fill:#CDF4D3,stroke:#66D575
    style s6 fill:#CDF4D3,stroke:#66D575
```
