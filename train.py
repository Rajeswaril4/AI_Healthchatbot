import pandas as pd
import json
import os
import pickle
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# Paths
DATA_DIR = "data"
ARTIFACTS_DIR = "artifacts"
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

# Load datasets
df = pd.read_csv(f"{DATA_DIR}/merged_dataset.csv")
desc_df = pd.read_csv(f"{DATA_DIR}/symptom_Description.csv", header=None, names=["Disease", "Description"])
prec_df = pd.read_csv(f"{DATA_DIR}/symptom_precaution.csv", header=None, names=["Disease", "Precaution_1", "Precaution_2", "Precaution_3", "Precaution_4"])

# Features and labels
X = df.drop("prognosis", axis=1)
y = df["prognosis"]

symptom_columns = list(X.columns)

# Train-test split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Models to compare
models = {
    "RandomForest": RandomForestClassifier(n_estimators=200, random_state=42),
    "DecisionTree": DecisionTreeClassifier(random_state=42),
    "LogisticRegression": LogisticRegression(max_iter=500, random_state=42),
    "SVM": SVC(probability=True, random_state=42),
    "GradientBoosting": GradientBoostingClassifier(random_state=42)
}

best_model_name = None
best_model = None
best_acc = 0
metrics = {}

# Train and evaluate each model
for name, clf in models.items():
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    metrics[name] = acc

    if acc > best_acc:
        best_acc = acc
        best_model_name = name
        best_model = clf

# Save best model
pickle.dump(best_model, open(f"{ARTIFACTS_DIR}/model.pkl", "wb"))
json.dump(symptom_columns, open(f"{ARTIFACTS_DIR}/symptom_columns.json", "w"))
json.dump(sorted(y.unique()), open(f"{ARTIFACTS_DIR}/label_classes.json", "w"))

# Disease info dictionary
disease_info = {}
for _, row in desc_df.iterrows():
    disease_info[row["Disease"].strip().lower()] = {"description": row["Description"]}
for _, row in prec_df.iterrows():
    name = row["Disease"].strip().lower()
    precautions = [p for p in row[1:].tolist() if isinstance(p, str)]
    if name in disease_info:
        disease_info[name]["precautions"] = precautions
    else:
        disease_info[name] = {"description": "", "precautions": precautions}

json.dump(disease_info, open(f"{ARTIFACTS_DIR}/disease_info.json", "w"))
json.dump(metrics, open(f"{ARTIFACTS_DIR}/metrics.json", "w"))

print(f"Best Model: {best_model_name} with Accuracy: {best_acc:.4f}")
print("All Model Accuracies:", metrics)
print(f"Artifacts saved to: {ARTIFACTS_DIR}")
