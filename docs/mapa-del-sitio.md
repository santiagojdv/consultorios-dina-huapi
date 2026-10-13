# Mapa del sitio

Copia versionada del diagrama editable en FigJam: https://www.figma.com/board/aByZhh0xM4F626XPdWcg7Y
GitHub muestra este diagrama renderizado. Si cambia la estructura, actualizar los dos.

Verde: existe. Amarillo: nuevo, a definir. Naranja: decisión o corrección pendiente.

```mermaid
flowchart LR
    dominio(["Dominio del consultorio"])

    subgraph s1 ["1. Consultorio para profesionales (existe)"]
        p1Home["Inicio: alquiler de consultorio"]
        p1Equip["Equipamiento y servicios"]
        p1Planes["Alquiler mensual (hoy dice paquetes de horas)"]
        p1Faq["Preguntas frecuentes"]
        p1Contacto["Contacto"]
    end

    subgraph s4 ["4. Consultorio para pacientes (nuevo)"]
        c4Home["Inicio pacientes"]
        c4Pros["Profesionales y especialidades"]
        c4Ubic["Ubicación y horarios"]
        c4Cta["Sacar turno"]
    end

    subgraph s3 ["3. Sitio de Nati (nuevo)"]
        n3Home["Inicio Nati"]
        n3Trat["Tratamientos"]
        n3Sobre["Sobre mí y matrícula"]
        n3Cta["Sacar turno con Nati"]
    end

    subgraph s2 ["2. Sistema de turnos (existe)"]
        t2Reserva["Reserva online de pacientes (sin login)"]
        t2Cancel["Ver o cancelar turno"]
        t2Login["Login profesionales (link al mail)"]
        decRol{"¿Es admin?"}
        vistaPro["Vista profesional: Agenda, Calendario, Mi perfil"]
        vistaAdmin["Vista admin: Calendario, Reservas, Profesionales, Consultorios"]
    end

    pendLogin>"A definir: login de pacientes"]
    db[("Supabase: base y login")]
    gcal[/"Google Calendar"/]
    wa[/"WhatsApp"/]

    dominio --> p1Home
    dominio --> c4Home
    p1Home --> p1Equip & p1Planes & p1Faq & p1Contacto
    p1Contacto -.->|"Consulta"| wa
    p1Home -->|"Acceso profesionales"| t2Login

    c4Home --> c4Pros & c4Ubic & c4Cta
    c4Pros -->|"Ficha de Nati"| n3Home
    c4Cta --> t2Reserva

    n3Home --> n3Trat & n3Sobre & n3Cta
    n3Cta -->|"Link directo con Nati"| t2Reserva

    t2Reserva -->|"Link personal"| t2Cancel
    t2Login --> decRol
    decRol -->|"No"| vistaPro
    decRol -->|"Sí"| vistaAdmin
    pendLogin -.-> t2Reserva

    t2Reserva --> db
    vistaPro --> db
    vistaAdmin --> db
    vistaPro -.->|"Feed de turnos"| gcal
    vistaPro -.->|"Avisos a pacientes"| wa

    style s1 fill:#CDF4D3,stroke:#66D575
    style s2 fill:#CDF4D3,stroke:#66D575
    style s3 fill:#FFECBD,stroke:#FFC943
    style s4 fill:#FFECBD,stroke:#FFC943
    style pendLogin fill:#FFE0C2,stroke:#FF9E42
    style p1Planes fill:#FFE0C2,stroke:#FF9E42
```

## Estado por sección

| # | Sección | Público | Estado | Dónde está |
|---|---|---|---|---|
| 1 | Consultorio para profesionales | Profesionales que alquilan | Existe (borrador con datos a completar) | `index.html` |
| 2 | Sistema de turnos | Pacientes y profesionales | Existe, falta configurar Supabase | `turnos/`, `supabase/` |
| 3 | Sitio de Nati | Pacientes de Nati | Nuevo | — |
| 4 | Consultorio para pacientes | Pacientes en general | Nuevo | — |

## Decisiones pendientes antes de producción

1. **Dominio y URLs.** ¿Un dominio con secciones (`/profesionales`, `/pacientes`, `/nati`) o dominios separados? Nati con dominio propio es más fuerte como marca personal, pero cuesta más mantenerlo.
2. **Puerta de entrada.** Hoy la home (`index.html`) les habla a profesionales. Con un sitio para pacientes, la raíz del dominio tiene que decidir a quién le habla primero, o ser una portada con dos caminos.
3. **Login de pacientes.** Hoy los pacientes reservan sin cuenta (menos fricción). Con login ganan historial y gestión de sus turnos, a cambio de fricción y más datos personales para resguardar.
4. **Modelo comercial en la sección 1.** El sitio dice "paquetes de horas"; el modelo real es de alquileres mensuales.
5. **Contenido del sitio de Nati.** Tratamientos, foto, matrícula, obras sociales, ubicación y reseñas. Las reseñas deberían ser reales y verificables.
6. **Datos personales.** Política de privacidad y registro de la base ante la AAIP (Ley 25.326) antes de abrir la reserva a pacientes.
