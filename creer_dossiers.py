import os

# Liste des années
annees = range(2022, 2026)

# Liste des événements
evenements = [
    "Weekend_d_integration",
    "Salon",
    "Conference",
    "Graduation",
    "Ceremonie_de_rentree",
    "Visite_d_entreprise"
]

# Création des dossiers
for annee in annees:
    dossier_principal = f"m{annee}"
    os.makedirs(dossier_principal, exist_ok=True)  # crée le dossier principal
    print(f"Création du dossier {dossier_principal}")
    
    # Création des sous-dossiers événements
    for evenement in evenements:
        chemin = os.path.join(dossier_principal, evenement)
        os.makedirs(chemin, exist_ok=True)
        print(f"   -> {chemin}")
