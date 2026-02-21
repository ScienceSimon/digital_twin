# Spot Positionering - Handleiding

## Hoe Werkt de Positionering?

### Inbouwspots (Recessed Spots)
**Model: `recessed_spot`**

```
PLAFOND (Y = 2.63m)
=========================
    |   +-----+   |         <- Trim ring (zichtbaar van onder)
    |   |     |   |         <- Lens (licht gloeit)
    +---+-----+---+         <- Glow halo
        | | |               <- Lichtstraal naar beneden
```

**Positionering:**
- Y = Plafondhoogte (bijv. 2.63m voor begane grond)
- Trim ring zit flush met plafond
- Housing zit boven het plafond (niet zichtbaar)

**Voorbeeld YAML:**
```yaml
- id: "kitchen_spot_1"
  ha_entity: "light.hue_color_spot_39"
  type: "lamp"
  model: "recessed_spot"
  position: { x: 4.8, y: 2.63, z: 2.44 }
```

---

### Opbouwspots / Cilinder Spots
**Model: `cylinder_spot`**

```
PLAFOND (Y = 2.63m)
=========================
        +---+               <- Montageplaat (tegen plafond)
        |   |
        | | |               <- Cilinder body (hangt ~20cm naar beneden)
        | | |
        +-O-+               <- Lens (licht gloeit)
          |                  <- Lichtstraal (kan geroteerd worden)
```

**Positionering:**
- Y = Plafondhoogte (bijv. 2.63m)
- Montageplaat zit tegen plafond
- Cilinder hangt ~20cm naar beneden

**Rotatie:**
- `x`: Kantelen vooruit/achteruit (bijv. 45 = schuin naar beneden)
- `y`: Draaien links/rechts
- `z`: Rollen (meestal niet nodig)

**Voorbeeld YAML:**
```yaml
- id: "hallway_spot_1"
  ha_entity: "light.hue_color_spot_42"
  type: "lamp"
  model: "cylinder_spot"
  position: { x: 1.66, y: 2.63, z: 1.79 }
  rotation: { x: 45, y: 0, z: 0 }
```

---

### Andere Lamp Modellen

| Model | Beschrijving | Typisch gebruik |
|-------|-------------|----------------|
| `sphere` | Bollamp (vloerlamp) | Woonkamer, slaapkamer |
| `light_tube` | Lichtslang/strip | Keuken, indirect licht |
| `light_ring` | Ringlamp | Plafondverlichting |
| `bulb` | Transparante gloeilamp | Decoratief |

---

## Plafondhoogtes per Verdieping

Volgens `house.yaml`:

| Verdieping | Hoogte (m) | Y-waarde voor Spots |
|------------|------------|---------------------|
| Begane grond (Level 0) | 2.63 | `y: 2.63` |
| 1e Verdieping (Level 1) | 2.63 | `y: 5.26` (2.63 + 2.63) |
| Zolder (Level 2) | 2.77 | `y: 8.03` (5.26 + 2.77) |

**Let op:** Bij schuine daken/plafonds rekening houden met de ceiling_profile!

---

## Alle Asset Types in `assets_iot.yaml`

| Type | Beschrijving | Label toggle |
|------|-------------|--------------|
| `lamp` | Alle lampen (diverse modellen) | Light Labels |
| `venetian_blinds` | Jaloezieeen met tilt/positie | Blind Labels |
| `device` | Apparaten (media players, robots) | Device Labels |
| `presence` | ESP32 radar modules | Modules |
| `Ethernet` | Netwerkapparaten (rack, switches, AP's) | Ethernet Labels |
| `temp_motion` | Temperatuur + bewegingssensor | Temperature |

---

## Tips voor Positionering

### Inbouwspots:
1. Y altijd op plafondhoogte
2. X en Z bepalen positie in kamer
3. Geen rotatie nodig (altijd recht naar beneden)
4. Afstand tussen spots: minimaal 0.5m

### Opbouw Cilinder Spots:
1. Y altijd op plafondhoogte
2. X en Z bepalen positie in kamer
3. rotation.x voor kanteling (bijv. 45 graden)
4. rotation.y voor draaiing

### Algemeen:
- Controleer plafondhoogte in `house.yaml` voor je verdieping
- Toggle "Light Labels" aan om posities te zien
- Toggle "Coordinates" aan voor exacte XYZ waarden

---

## Checklist Nieuwe Spot Toevoegen

1. Bepaal type: `recessed_spot`, `cylinder_spot`, `sphere`, `light_tube`, `light_ring`, of `bulb`
2. Zoek plafondhoogte op in `house.yaml`
3. Bepaal X en Z positie in de kamer
4. Zet Y op plafondhoogte
5. (Optioneel) Voeg rotatie toe voor cylinder spots
6. Voeg toe aan `data/assets_iot.yaml`
7. Herlaad Digital Twin
8. Navigeer naar locatie en verifieer visueel
9. Test met Home Assistant (kleur/helderheid)
