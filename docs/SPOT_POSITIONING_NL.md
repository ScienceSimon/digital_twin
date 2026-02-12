# Spot Positionering - Handleiding

## 🎯 Hoe Werkt de Positionering?

### Inbouwspots (Recessed Spots)
**Model: `recessed_spot`**

```
PLAFOND (Y = 2.63m)
═════════════════════════════
    │   ┌─────┐   │           ← Trim ring (zichtbaar van onder)
    │   │  ⚪  │   │           ← Lens (licht gloeit)
    └───┴─────┴───┘           ← Glow halo
        ↓ ↓ ↓                 ← Lichtstraal naar beneden
```

**Positionering:**
- **Y-coördinaat = Plafondhoogte** (bijv. 2.63m voor begane grond)
- Trim ring zit flush met plafond
- Housing zit BOVEN het plafond (niet zichtbaar)
- Lens en glow zichtbaar van onderaf

**Voorbeeld YAML:**
```yaml
- id: "kitchen_spot_1"
  ha_entity: "light.hue_color_spot_39"
  type: "lamp"
  model: "recessed_spot"
  x: 4.8      # X-positie in keuken
  y: 2.63     # Plafondhoogte
  z: 2.44     # Z-positie in keuken
```

---

### Opbouwspots / Cilinder Spots (WC-rol)
**Model: `cylinder_spot`**

```
PLAFOND (Y = 2.63m)
═════════════════════════════
        ┌───┐                 ← Montageplaat (tegen plafond)
        │   │
        │ ║ │                 ← Cilinder body (hangt naar beneden ~20cm)
        │ ║ │
        └─⚪─┘                 ← Lens (licht gloeit)
          ↓                   ← Lichtstraal (kan geroteerd worden)
```

**Positionering:**
- **Y-coördinaat = Plafondhoogte** (bijv. 2.63m)
- Montageplaat zit tegen plafond
- Cilinder hangt ~20cm naar beneden
- Lens zit aan onderkant van cilinder

**Rotatie:**
- `rx`: Kantelen vooruit/achteruit (bijv. 45° = schuin naar beneden)
- `ry`: Draaien links/rechts
- `rz`: Rollen (meestal niet nodig)

**Voorbeeld YAML:**
```yaml
- id: "hallway_spot_1"
  ha_entity: "light.hue_color_spot_42"
  type: "lamp"
  model: "cylinder_spot"
  x: 1.66     # X-positie in gang
  y: 2.63     # Plafondhoogte
  z: 1.79     # Z-positie in gang
  rx: 45      # 45° gekanteld naar voren
  ry: 0       # Geen rotatie links/rechts
  rz: 0       # Geen rol
```

---

## 📏 Plafondhoogtes per Verdieping

Volgens `house.yaml`:

| Verdieping | Hoogte (m) | Y-waarde voor Spots |
|------------|------------|---------------------|
| Begane grond (Level 0) | 2.63 | `y: 2.63` |
| 1e Verdieping (Level 1) | 2.63 | `y: 5.26` (2.63 + 2.63) |
| Zolder (Level 2) | 2.77 | `y: 8.03` (5.26 + 2.77) |

**Let op:** Bij schuine daken/plafonds moet je rekening houden met de ceiling_profile!

---

## 🎨 Wat Zie je in de Digital Twin?

### Inbouwspot (Recessed):
- ⭕ **Zilverkleurige trim ring** (metaal, flush met plafond)
- 💡 **Gloeiende lens** (warm geel/wit licht)
- ✨ **Glow halo** (zachte gloed rondom)
- 🔦 **Lichtstraal** naar beneden (SpotLight)

### Cilinder Spot (Opbouw):
- ⚫ **Donkere montageplaat** (tegen plafond)
- 🔲 **Zwarte cilinder** (~20cm lang, hangt naar beneden)
- 💡 **Gloeiende lens** (aan onderkant cilinder)
- ✨ **Glow ring** (rondom lens)
- 🔦 **Lichtstraal** in rotatie-richting

---

## 🔧 Huidige Configuratie

### Keuken - 2x Inbouwspots
```
Positie: (4.8, 2.63, 2.44) en (4.8, 2.63, 0.65)
Type: Recessed (inbouw)
Montage: Verzonken in plafond
Richting: Recht naar beneden
```

### Gang - 3x Cilinder Spots
```
Posities: (1.66, 2.63, 1.51/1.65/1.79)
Type: Cylinder (opbouw)
Montage: Hangend onder plafond
Richting: 45° gekanteld naar voren
```

---

## 💡 Tips voor Positionering

### Inbouwspots:
1. ✅ **Y altijd op plafondhoogte**
2. ✅ **X en Z bepalen positie in kamer**
3. ❌ **GEEN rotatie nodig** (altijd recht naar beneden)
4. 🎯 **Afstand tussen spots:** minimaal 0.5m voor goede lichtverdeling

### Opbouw Cilinder Spots:
1. ✅ **Y altijd op plafondhoogte**
2. ✅ **X en Z bepalen positie in kamer**
3. ✅ **RX voor kanteling** (bijv. 45° om schuin te richten)
4. ✅ **RY voor draaiing** (om richting aan te passen)
5. 🎯 **Afstand tussen spots:** 0.14-0.28m voor rail-effect

### Algemeen:
- 📐 **Controleer plafondhoogte** in `house.yaml` voor je verdieping
- 🎨 **Test eerst met 1 spot** voordat je meerdere plaatst
- 👁️ **Bekijk van onderaf** in de Digital Twin (camera positie belangrijk!)
- 🔍 **Check console logs** voor debug info

---

## 🐛 Problemen Oplossen

### "Ik zie de spots niet"
- ✅ Check console: zie je "Creating recessed/cylinder spot" messages?
- ✅ Check Y-positie: staat die op of net onder plafondhoogte?
- ✅ Toggle "Light Labels" aan om te zien waar ze zouden moeten zijn
- ✅ Navigeer naar de juiste kamer en kijk omhoog

### "Inbouwspots steken uit"
- ⚠️ Y-positie is te laag → moet op plafondhoogte (2.63m)
- ⚠️ Check of je geen oude posities hebt (bijv. 2.625 → 2.63)

### "Cilinder spots hangen in het plafond"
- ⚠️ Y-positie is te hoog → moet op plafondhoogte (2.63m)
- ℹ️ Model hangt automatisch 20cm naar beneden

### "Rotatie werkt niet"
- ⚠️ Alleen cylinder_spot ondersteunt rotatie
- ⚠️ Check rx/ry/rz waarden in YAML
- ⚠️ Waarden zijn in GRADEN (niet radialen)

---

## ✅ Checklist Nieuwe Spot Toevoegen

1. [ ] Bepaal type: `recessed_spot` of `cylinder_spot`
2. [ ] Zoek plafondhoogte op in `house.yaml`
3. [ ] Bepaal X en Z positie in de kamer
4. [ ] Zet Y op plafondhoogte
5. [ ] (Optioneel) Voeg rotatie toe voor cylinder spots
6. [ ] Voeg toe aan `assets_iot.yaml`
7. [ ] Herlaad Digital Twin
8. [ ] Check console voor creation messages
9. [ ] Navigeer naar locatie en verifieer visueel
10. [ ] Test met Home Assistant (kleur/helderheid)

---

## 📐 Voorbeeld: Nieuwe Spot Toevoegen

**Scenario:** Ik wil een inbouwspot toevoegen in de woonkamer op positie (2.5, ?, 5.0)

**Stappen:**
1. Check `house.yaml` → Woonkamer is Level 0 → hoogte = 2.63m
2. Y-waarde wordt: `2.63`
3. Voeg toe aan YAML:

```yaml
- id: "living_room_spot_1"
  ha_entity: "light.hue_color_spot_50"
  type: "lamp"
  model: "recessed_spot"
  x: 2.5
  y: 2.63    # Plafondhoogte Level 0
  z: 5.0
```

4. Save & reload → Spot verschijnt in plafond! ✨

---

**Pro Tip:** Gebruik de coordinate display in de sensor labels om exacte posities te bepalen! 📍
