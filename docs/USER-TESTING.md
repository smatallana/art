# Protocolo de prueba con usuarias reales

> **Estado (2026-07-30): ejecutado parcialmente.** Las dos primeras
> sesiones reales (esposa: 3 parejas; hija: 5 sesiones completas)
> produjeron los dos hallazgos del tramo 8 — falta de propósito visible al
> abrir y cierre de sesión siempre idéntico — más una crítica de método
> (probar con múltiples "personas"). Los tres están registrados en
> DECISIONS (tramo 8) y corregidos: bienvenida de primera vez, resumen con
> épocas y hechos calculados, etiquetado CLIP del catálogo, y un harness
> permanente de personas sintéticas sobre el catálogo real. El protocolo
> completo de abajo sigue pendiente de correrse con 6–10 personas más.

La evaluación externa (§20, ronda 3) tiene razón en algo que ningún test
automático puede cubrir: si las primeras obras atrapan, si el resumen se
siente VERDADERO, si la app parece adaptarse. Eso solo se ve observando a
personas reales en teléfonos reales. Este protocolo está pensado para que
lo corras tú con tus hijas y con 6–10 personas más (amigos, familia).

## Preparación (2 minutos por persona)

1. Teléfono de la persona, no el tuyo. Safari o Chrome, da igual.
2. URL: `https://smatallana.github.io/art/` — en ventana normal (no
   privada, para que la persistencia funcione).
3. Si el navegador ya tiene datos de otra persona: Settings → "Erase local
   data" ANTES de empezar (o usa otro navegador del mismo teléfono).
4. Di solo esto: *"Es una app para descubrir qué pintura te gusta. Úsala
   como quieras; yo solo miro."* **Nada más. No expliques ningún botón.**

## Observación (sesión 1 completa, ~5 minutos)

No ayudes. No corrijas. Apunta (sí/no y una nota corta):

- ¿Dudó en la primera pantalla sin saber qué hacer?
- ¿Las tres primeras parejas le interesaron o pasó rápido y aburrida?
- ¿Alguna obra le pareció "rara, fea de imagen, o imposible de juzgar"?
- ¿Usó "Both/Neither/Unsure" alguna vez sin que se lo explicaras?
- ¿Abrió algún desplegable ("Add context", "About this work")?
- ¿Guardó alguna obra? ¿Cuál(es)?
- ¿En qué pareja miró el reloj / bostezó / aceleró? (número de pareja)
- Al terminar: ¿leyó el resumen o lo saltó?
- ¿Pulsó "Another session" sin que se lo pidieras?

## Preguntas después (5 minutos, en sus palabras)

1. ¿Las tres primeras comparaciones te interesaron?
2. ¿Alguna obra te pareció aleatoria o difícil de ver en el teléfono?
3. ¿Sentiste que la app se adaptaba a ti?
4. ¿El resumen final te pareció VERDAD? ¿Qué frase sí y cuál no?
5. Las miniaturas de evidencia: ¿apoyaban la conclusión?
6. ¿Entendiste qué pasaría al pulsar el botón grande del final?
7. ¿Querías seguir? ¿Por qué sí/no?
8. Cuando respondiste "Neither": ¿qué pasaba de verdad?
9. ¿Algo te pareció obligatorio cuando era opcional?
10. ¿Aprendiste algo — de arte o de ti?

## Registro

Copia esta tabla por persona en una nota:

| Campo | Valor |
|---|---|
| Persona / edad aprox | |
| Dispositivo / navegador | |
| ¿Terminó la sesión 1? | |
| Nº de "neither/unsure" | |
| Nº de guardados | |
| Momento de aburrimiento (pareja nº) | |
| ¿El resumen le pareció verdad? | |
| ¿Empezó sesión 2 sola? | |
| Cita textual más útil | |

## Qué hacer con los resultados

- Patrones (≥3 personas coinciden) → van a DECISIONS y se arreglan en el
  siguiente tramo. Casos únicos → BACKLOG.
- Si una obra concreta sale como "rara/ilegible" 2+ veces → quitarla de
  `data/curated/onboarding.json` (editar el JSON a mano y comitear; la
  validación de CI protege el resto).
- Regla de la evaluación: **no ampliar funcionalidades hasta iterar sobre
  lo observado.**

## Umbrales numéricos de la 4ª evaluación — solo referencia

El desarrollo NO se congela sobre estos números (decisión del dueño,
tramo 9); quedan como vara de medir al correr el protocolo con ~10
personas en sus propios teléfonos y sin explicar los controles:

- ≥ 8/10 entienden el propósito sin ayuda.
- ≥ 8/10 terminan las 6 elecciones de la primera sesión.
- ≥ 7/10 dicen que el resumen es mayormente o claramente verdad.
- ≥ 5/10 continúan o exploran voluntariamente.
- ≤ 1/10 confunde las acciones secundarias (Ambos / Ninguno / No sé decidir).
- ≥ 6/10 perciben la segunda sesión como más relevante.
- Ninguna obra de apertura señalada como inadecuada por ≥ 2 personas.
