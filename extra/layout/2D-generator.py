import yaml
import matplotlib.pyplot as plt
from shapely.geometry import Polygon, LineString
import os

# Paden instellen (relatief aan project root)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
YAML_PATH = os.path.join(PROJECT_ROOT, "data", "house.yaml")
OUTPUT_FOLDER = os.path.join(SCRIPT_DIR)
OUTPUT_FILE = os.path.join(OUTPUT_FOLDER, "plattegrond_compleet.png")

def plot_house():
    # 1. Voorbereiding
    if not os.path.exists(OUTPUT_FOLDER):
        os.makedirs(OUTPUT_FOLDER)

    if not os.path.exists(YAML_PATH):
        print(f"ERROR: YAML niet gevonden op {YAML_PATH}")
        return

    with open(YAML_PATH, 'r') as f:
        data = yaml.safe_load(f)

    house = data['house']
    metadata = house.get('metadata', {})
    dims = metadata.get('dimensions', {'width': 5, 'depth': 10})
    max_w = dims['width']
    max_d = dims['depth']
    floors = house['floors']

    # Maak subplots voor elke verdieping
    fig, axes = plt.subplots(1, len(floors), figsize=(6 * len(floors), 8))
    if len(floors) == 1: 
        axes = [axes]

    for i, floor in enumerate(floors):
        ax = axes[i]
        ax.set_title(f"{floor['name']} (Level {floor['level']})", fontweight='bold', pad=15)
        
        # Achtergrond (Fundering/buitenkant)
        fundering = Polygon([[0, 0], [max_w, 0], [max_w, max_d], [0, max_d]])
        fx, fy = fundering.exterior.xy
        ax.fill(fx, fy, color='lightgrey', alpha=0.1)

        # Kamers en elementen tekenen
        for room in floor['rooms']:
            poly_points = room['polygon']
            
            # Check of het een void is of has_floor: false
            is_void = room.get('is_void', False)
            has_no_floor = room.get('has_floor', True) == False
            
            # Sluit de polygon
            points = poly_points + [poly_points[0]]
            poly = Polygon(poly_points)
            
            # Kleur de kamer in
            px, py = poly.exterior.xy
            if is_void or has_no_floor:
                # Voids/trapgaten in rood/oranje
                ax.fill(px, py, color='orange', alpha=0.3, label=room['id'])
            else:
                # Normale kamers
                ax.fill(px, py, alpha=0.2, label=room['id'])
            
            # --- MUUR LOGICA (met no_walls, doors en windows check) ---
            no_walls = room.get('no_walls', [])
            doors = room.get('doors', [])
            windows = room.get('windows', [])  # NIEUW: haal ramen op
            open_segments = no_walls + doors  # Combineer no_walls en doors
            
            for j in range(len(points) - 1):
                p1 = points[j]
                p2 = points[j+1]
                
                # Check of dit segment open is (no_wall OF door)
                is_open = False
                for open_segment in open_segments:
                    # Check beide richtingen
                    if ((p1 == open_segment[0] and p2 == open_segment[1]) or 
                        (p1 == open_segment[1] and p2 == open_segment[0])):
                        is_open = True
                        break
                
                # NIEUW: Check of dit segment een raam heeft
                is_window = False
                for win in windows:
                    seg = win.get('segment', win) if isinstance(win, dict) else win
                    if ((p1 == seg[0] and p2 == seg[1]) or
                        (p1 == seg[1] and p2 == seg[0])):
                        is_window = True
                        break
                
                # Bepaal welk type opening het is (voor deuren)
                is_door = False
                if is_open:
                    for door_segment in doors:
                        if ((p1 == door_segment[0] and p2 == door_segment[1]) or 
                            (p1 == door_segment[1] and p2 == door_segment[0])):
                            is_door = True
                            break
                
                # Teken muur, opening of raam
                if is_void or has_no_floor:
                    # Voids/trapgaten altijd met stippellijn
                    ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color='red', linestyle='--', linewidth=1.5)
                elif is_window:
                    # NIEUW: Raam (blauw, dubbele lijn voor kozijn effect)
                    ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color='deepskyblue', linewidth=4, alpha=0.6)
                    ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color='lightblue', linewidth=2, alpha=0.8)
                    # Voeg kleine streepjes toe voor ruitjes effect
                    mid_x = (p1[0] + p2[0]) / 2
                    mid_y = (p1[1] + p2[1]) / 2
                    ax.plot([mid_x], [mid_y], 'o', color='deepskyblue', markersize=3)
                elif not is_open:
                    # Normale muur (zwart, dik)
                    ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color='black', linewidth=2)
                elif is_door:
                    # Deur (bruin, stippellijn)
                    ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color='saddlebrown', linestyle=':', linewidth=2, alpha=0.7)
                else:
                    # Open verbinding / no_wall (grijs, stippellijn)
                    ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color='grey', linestyle='--', linewidth=1, alpha=0.5)

            # Naam van de kamer/ruimte
            label_text = room.get('label', room['id'])
            ax.text(poly.centroid.x, poly.centroid.y, label_text, 
                    fontsize=7, ha='center', va='center', fontweight='bold',
                    bbox=dict(facecolor='white', alpha=0.8, edgecolor='none', pad=1))
            
            # Teken polygon punten als rode dots (voor debugging)
            for pt in poly_points:
                ax.plot(pt[0], pt[1], 'ro', markersize=3)

        # Viewport instellen
        ax.set_aspect('equal')
        ax.set_xlim(-0.5, max_w + 0.5)
        ax.set_ylim(-0.5, max_d + 0.5)
        ax.invert_yaxis()  # Spiegel Y-as zodat het matched met 3D viewer
        ax.grid(True, linestyle=':', alpha=0.3)
        ax.set_xlabel('X (breedte)')
        ax.set_ylabel('Z (diepte)')

    # NIEUW: Legenda toevoegen
    from matplotlib.lines import Line2D
    legend_elements = [
        Line2D([0], [0], color='black', linewidth=2, label='Muur'),
        Line2D([0], [0], color='saddlebrown', linewidth=2, linestyle=':', label='Deur'),
        Line2D([0], [0], color='deepskyblue', linewidth=3, label='Raam'),
        Line2D([0], [0], color='grey', linewidth=1, linestyle='--', label='Open'),
        Line2D([0], [0], color='red', linewidth=1, linestyle='--', label='Trapgat')
    ]
    axes[-1].legend(handles=legend_elements, loc='upper right', fontsize=8)

    plt.suptitle(f"Plattegrond: {metadata.get('name', 'Mijn Huis')}", fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.subplots_adjust(top=0.90)
    
    plt.savefig(OUTPUT_FILE, dpi=150)
    print(f"✓ Plattegrond gegenereerd: {OUTPUT_FILE}")
    print(f"  - {len(floors)} verdiepingen")
    for floor in floors:
        room_count = len([r for r in floor['rooms'] if not r.get('is_void', False) and r.get('has_floor', True)])
        void_count = len([r for r in floor['rooms'] if r.get('is_void', False) or r.get('has_floor', True) == False])
        window_count = sum(len(r.get('windows', [])) for r in floor['rooms'])
        print(f"  - {floor['name']}: {room_count} kamers, {void_count} voids, {window_count} ramen")
    
    plt.show()

if __name__ == "__main__":
    plot_house()