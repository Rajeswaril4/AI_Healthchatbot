# app.py
import os
import json
import pickle
import pandas as pd
import numpy as np
from flask import Flask, render_template, request

app = Flask(__name__)

# Paths
MODEL_PATH = "artifacts/model.pkl"
SYMPTOM_COLUMNS_PATH = "artifacts/symptom_columns.json"
DISEASE_INFO_PATH = "artifacts/disease_info.json"
DATA_PATH = "data/merged_dataset.csv"

# Load artifacts with graceful fallbacks
model = None
symptom_columns = []
disease_info = {}
data = pd.DataFrame()

# Dummy fallback model
class DummyModel:
    def __init__(self, classes):
        self.classes_ = np.array(classes)

    def predict(self, X):
        results = []
        for x in X:
            idx = int(sum(x)) % len(self.classes_)
            results.append(self.classes_[idx])
        return np.array(results)

    def predict_proba(self, X):
        probs = []
        for x in X:
            s = float(sum(x))
            n = len(self.classes_)
            base = np.full(n, 0.05)
            idx = int(s) % n
            base[idx] += 0.9
            base = base / base.sum()
            probs.append(base)
        return np.array(probs)

try:
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
    if os.path.exists(SYMPTOM_COLUMNS_PATH):
        with open(SYMPTOM_COLUMNS_PATH, "r", encoding="utf-8") as f:
            symptom_columns = json.load(f)
    if os.path.exists(DISEASE_INFO_PATH):
        with open(DISEASE_INFO_PATH, "r", encoding="utf-8") as f:
            disease_info = json.load(f)
    if os.path.exists(DATA_PATH):
        data = pd.read_csv(DATA_PATH)
    print("✅ Artifacts loaded (existing files used).")
except Exception as e:
    print(f"⚠️ Error loading some artifacts: {e}")

if not symptom_columns:
    symptom_columns = [
        "fever", "cough", "headache", "fatigue", "sore_throat",
        "runny_nose", "shortness_of_breath", "nausea", "vomiting"
    ]

if not disease_info:
    disease_info = {
        "common cold": {
            "description": "A mild viral infection of the nose and throat.",
            "precautions": [
                "Rest",
                "Stay hydrated",
                "Use saline nasal drops if needed"
            ]
        },
        "flu": {
            "description": "Influenza — viral infection causing fever, body aches.",
            "precautions": [
                "See physician if high fever",
                "Rest and fluids",
                "Antiviral medication may help if early"
            ]
        }
    }

if model is None:
    model = DummyModel(classes=["Common Cold", "Flu", "Allergy"])
    print("ℹ️ Using DummyModel fallback (no real model found).")

@app.route('/')
def index():
    return render_template('index.html', symptoms=symptom_columns)

@app.route('/predict', methods=['POST'])
def predict():
    try:
        selected_symptoms = request.form.getlist('symptoms')

        if not selected_symptoms:
            return render_template(
                'result.html',
                result={
                    'disease': 'No Symptoms Selected',
                    'description': 'Please select at least one symptom to proceed.',
                    'doctor_specialty': 'N/A',
                    'precautions': ['Please choose symptoms and try again.'],
                    'confidence': 'N/A',
                    'conf_num': None,
                    'selected_symptoms': []
                }
            )

        # Build input vector
        input_data = [1 if symptom in selected_symptoms else 0 for symptom in symptom_columns]

        # Predict
        prediction = model.predict([input_data])[0]
        disease_name = str(prediction).strip().lower()

        # Compute confidence if possible
        confidence_value = None
        try:
            if hasattr(model, "predict_proba"):
                probs = model.predict_proba([input_data])[0]
                classes = np.array(getattr(model, "classes_", []), dtype=object)
                match_idx = np.where(classes == prediction)[0]
                if match_idx.size == 0:
                    match_idx = np.where(np.char.lower(classes.astype(str)) == str(prediction).lower())[0]
                if match_idx.size:
                    confidence_value = float(probs[int(match_idx[0])])
                else:
                    confidence_value = float(probs.max())
            elif hasattr(model, "decision_function"):
                scores = model.decision_function([input_data])
                scores = np.asarray(scores).squeeze()
                exp_scores = np.exp(scores - np.max(scores))
                probs = exp_scores / exp_scores.sum()
                idx = int(np.argmax(probs))
                confidence_value = float(probs[idx])
            else:
                confidence_value = None
        except Exception as ce:
            print(f"⚠️ Confidence computation failed: {ce}")
            confidence_value = None

        if confidence_value is None or (isinstance(confidence_value, float) and np.isnan(confidence_value)):
            confidence_display = "N/A"
            conf_num = None
        else:
            confidence_display = f"{confidence_value * 100:.1f}%"
            conf_num = round(float(confidence_value * 100), 1)

        # Lookup disease metadata
        disease_details = disease_info.get(disease_name, None)
        if not disease_details:
            for key, val in disease_info.items():
                if key.lower() == disease_name:
                    disease_details = val
                    break

        if not disease_details:
            description = "No description available."
            precautions = ["No precautions available."]
        else:
            description = disease_details.get("description", "No description available.")
            precautions = disease_details.get("precautions", ["No precautions available."])

        # Find specialist
        doctor_specialist = "General Physician"
        try:
            if not data.empty and "prognosis" in data.columns:
                matches = data[data["prognosis"].str.lower() == disease_name]
                if not matches.empty and "Specialist" in matches.columns:
                    doctor_specialist = matches.iloc[0].get("Specialist", doctor_specialist)
        except Exception:
            pass

        result = {
            'disease': prediction,
            'description': description,
            'doctor_specialty': doctor_specialist,
            'precautions': precautions,
            'confidence': confidence_display,
            'conf_num': conf_num,
            # pass back the raw selected symptom keys (template will render pretty labels)
            'selected_symptoms': selected_symptoms
        }

        return render_template('result.html', result=result)

    except Exception as e:
        print(f"❌ Prediction Error: {e}")
        return render_template(
            'result.html',
            result={
                'disease': 'Error Occurred',
                'description': str(e),
                'doctor_specialty': 'N/A',
                'precautions': ['Please try again later.'],
                'confidence': 'N/A',
                'conf_num': None,
                'selected_symptoms': []
            }
        )

if __name__ == '__main__':
    app.run(debug=True, port=5000)