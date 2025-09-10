import os
import subprocess

def convertir_heic_en_jpg(dossier_heic):
    # Vérifier que le dossier existe
    if not os.path.isdir(dossier_heic):
        print("❌ Dossier introuvable :", dossier_heic)
        return

    # Parcourir tous les fichiers du dossier
    for fichier in os.listdir(dossier_heic):
        if fichier.lower().endswith(".heic"):
            chemin_source = os.path.join(dossier_heic, fichier)
            chemin_destination = os.path.splitext(chemin_source)[0] + ".jpg"

            # Commande heif-convert
            print(f"🔄 Conversion : {chemin_source} -> {chemin_destination}")
            try:
                subprocess.run(
                    ["heif-convert", chemin_source, chemin_destination],
                    check=True
                )
            except subprocess.CalledProcessError:
                print(f"⚠️ Erreur lors de la conversion de {chemin_source}")

if __name__ == "__main__":
    dossier = input("Entre le chemin du dossier HEIC : ").strip()
    convertir_heic_en_jpg(dossier)
    print("✅ Conversion terminée.")
