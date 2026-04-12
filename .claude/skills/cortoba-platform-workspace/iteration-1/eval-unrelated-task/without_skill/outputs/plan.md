# Plan : Script Python d'analyse de ventes CSV avec graphique matplotlib

## Etapes detaillees

### 1. Creer le fichier du script Python

- Creer un fichier nomme `analyse_ventes.py` dans le repertoire de travail (`E:\public_html\public_html`).

### 2. Ajouter les imports necessaires

- Importer `csv` (module standard) pour la lecture du fichier CSV.
- Importer `matplotlib.pyplot` pour la generation de graphiques.
- Importer `collections.defaultdict` pour agreger facilement les donnees.
- Importer `sys` pour accepter le chemin du fichier CSV en argument de ligne de commande.
- Importer `os` pour verifier l'existence du fichier.

### 3. Definir la structure attendue du fichier CSV

- Documenter dans un commentaire en tete de script le format attendu du CSV :
  - Colonnes minimales : `date`, `produit`, `quantite`, `prix_unitaire`
  - Separateur : virgule (`,`) ou point-virgule (`;`) avec detection automatique.
  - Encodage : UTF-8 (avec fallback vers `latin-1`).

### 4. Implementer la fonction de lecture du CSV

- Creer une fonction `lire_csv(chemin_fichier)` qui :
  - Ouvre le fichier avec gestion d'encodage (essayer `utf-8`, puis `latin-1`).
  - Detecte automatiquement le delimiteur avec `csv.Sniffer().sniff()`.
  - Lit les lignes avec `csv.DictReader`.
  - Valide que les colonnes requises (`date`, `produit`, `quantite`, `prix_unitaire`) sont presentes.
  - Convertit `quantite` en entier et `prix_unitaire` en flottant.
  - Calcule un champ derive `montant_total` = `quantite * prix_unitaire` pour chaque ligne.
  - Retourne une liste de dictionnaires representant chaque vente.
  - Gere les erreurs : fichier introuvable, colonnes manquantes, valeurs non numeriques (avec un message explicite et saut de la ligne en erreur).

### 5. Implementer les fonctions d'analyse

- Creer une fonction `analyser_ventes_par_produit(ventes)` qui :
  - Utilise `defaultdict(float)` pour agreger le `montant_total` par `produit`.
  - Retourne un dictionnaire `{produit: total_ventes}`.

- Creer une fonction `analyser_ventes_par_date(ventes)` qui :
  - Utilise `defaultdict(float)` pour agreger le `montant_total` par `date`.
  - Trie les resultats par date (ordre chronologique).
  - Retourne un dictionnaire ordonne `{date: total_ventes}`.

- Creer une fonction `calculer_statistiques(ventes)` qui :
  - Calcule le chiffre d'affaires total.
  - Calcule le nombre total de transactions.
  - Identifie le produit le plus vendu (en montant).
  - Identifie la date avec le plus de ventes.
  - Retourne un dictionnaire contenant ces statistiques.

### 6. Implementer la generation de graphiques

- Creer une fonction `generer_graphiques(ventes_par_produit, ventes_par_date, statistiques)` qui produit une figure matplotlib contenant deux sous-graphiques (subplots) :

  **Sous-graphique 1 (en haut) : Diagramme en barres des ventes par produit**
  - Utiliser `plt.subplot(2, 1, 1)`.
  - Axe X : noms des produits.
  - Axe Y : montant total des ventes.
  - Ajouter un titre : "Ventes par produit".
  - Ajouter des etiquettes sur les axes.
  - Colorer chaque barre avec une couleur distincte via une colormap (par exemple `plt.cm.Set3`).
  - Ajouter les valeurs au-dessus de chaque barre avec `plt.text()`.

  **Sous-graphique 2 (en bas) : Courbe d'evolution des ventes par date**
  - Utiliser `plt.subplot(2, 1, 2)`.
  - Axe X : dates (formatees lisiblement, avec rotation a 45 degres).
  - Axe Y : montant total des ventes.
  - Tracer une ligne avec marqueurs (`plt.plot()` avec `marker='o'`).
  - Ajouter un titre : "Evolution des ventes dans le temps".
  - Ajouter des etiquettes sur les axes.
  - Ajouter une grille en arriere-plan avec `plt.grid(True, alpha=0.3)`.

  **Mise en page globale :**
  - Ajouter un titre general avec `plt.suptitle()` incluant le chiffre d'affaires total.
  - Appeler `plt.tight_layout()` pour eviter les chevauchements.
  - Sauvegarder la figure en PNG avec `plt.savefig('rapport_ventes.png', dpi=150, bbox_inches='tight')`.
  - Afficher le graphique avec `plt.show()`.

### 7. Implementer l'affichage du resume textuel en console

- Creer une fonction `afficher_resume(statistiques)` qui :
  - Imprime le chiffre d'affaires total formate avec separateur de milliers.
  - Imprime le nombre total de transactions.
  - Imprime le produit le plus vendu et son montant.
  - Imprime la date avec le plus de ventes et son montant.

### 8. Implementer le bloc principal (`if __name__ == "__main__"`)

- Verifier qu'un argument (chemin du fichier CSV) est fourni via `sys.argv`, sinon afficher un message d'usage et quitter.
- Verifier que le fichier existe avec `os.path.isfile()`.
- Appeler `lire_csv()` pour charger les donnees.
- Verifier que des donnees valides ont ete chargees (liste non vide).
- Appeler `analyser_ventes_par_produit()`.
- Appeler `analyser_ventes_par_date()`.
- Appeler `calculer_statistiques()`.
- Appeler `afficher_resume()`.
- Appeler `generer_graphiques()`.
- Imprimer un message confirmant la sauvegarde du graphique.

### 9. Creer un fichier CSV d'exemple pour les tests

- Creer un fichier `ventes_exemple.csv` avec le contenu suivant (environ 15-20 lignes) :
  - Colonnes : `date,produit,quantite,prix_unitaire`
  - Donnees couvrant plusieurs produits (par exemple : Laptop, Souris, Clavier, Ecran, Casque).
  - Donnees couvrant plusieurs dates (par exemple : du 2026-01-05 au 2026-03-20).
  - Quantites et prix varies pour obtenir des graphiques interessants.

### 10. Tester le script

- Executer la commande : `python analyse_ventes.py ventes_exemple.csv`
- Verifier que :
  - Le resume textuel s'affiche correctement dans la console.
  - Le fichier `rapport_ventes.png` est genere dans le repertoire courant.
  - Le graphique s'affiche a l'ecran (si un environnement graphique est disponible).
  - Aucune erreur n'est levee.

### 11. Tester la gestion des erreurs

- Tester sans argument : `python analyse_ventes.py` -- doit afficher le message d'usage.
- Tester avec un fichier inexistant : `python analyse_ventes.py inexistant.csv` -- doit afficher une erreur claire.
- Tester avec un CSV mal forme (colonnes manquantes) -- doit afficher un message d'erreur indiquant les colonnes manquantes.

### 12. Verifier les dependances

- S'assurer que `matplotlib` est installe. Si non, l'installer avec : `pip install matplotlib`.
- Les autres modules (`csv`, `collections`, `sys`, `os`) font partie de la bibliotheque standard Python et ne necessitent pas d'installation.
