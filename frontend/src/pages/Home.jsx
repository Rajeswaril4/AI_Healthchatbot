import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Home.css';

const Home = () => {
  const [symptoms, setSymptoms] = useState([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState('');

  const { api } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchSymptoms();
  }, []);

  const fetchSymptoms = async () => {
    try {
      const response = await api.get('/symptoms');
      setSymptoms(response.data.symptoms);
    } catch (err) {
      setError('Failed to load symptoms');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSymptom = (symptom) => {
    setSelectedSymptoms((prev) =>
      prev.includes(symptom)
        ? prev.filter((s) => s !== symptom)
        : [...prev, symptom]
    );
  };

  const handlePredict = async (e) => {
    e.preventDefault();

    if (selectedSymptoms.length === 0) {
      setError('Please select at least one symptom');
      return;
    }

    setPredicting(true);
    setError('');

    try {
      const response = await api.post('/predict', {
        symptoms: selectedSymptoms,
      });

      navigate('/result', { state: { result: response.data } });
    } catch (err) {
      setError(err.response?.data?.error || 'Prediction failed');
      console.error(err);
    } finally {
      setPredicting(false);
    }
  };

  const filteredSymptoms = symptoms.filter((symptom) =>
    symptom.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSymptomName = (symptom) => {
    return symptom
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-spinner">Loading symptoms...</div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="content-wrapper">
        <h2 className="page-title">Select Your Symptoms</h2>

        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search symptoms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handlePredict}>
          <div className="symptom-grid">
            {filteredSymptoms.map((symptom) => (
              <div
                key={symptom}
                className={`symptom-card ${
                  selectedSymptoms.includes(symptom) ? 'selected' : ''
                }`}
                onClick={() => toggleSymptom(symptom)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSymptom(symptom);
                  }
                }}
                aria-pressed={selectedSymptoms.includes(symptom)}
              >
                <span className="symptom-label">
                  {formatSymptomName(symptom)}
                </span>
              </div>
            ))}
          </div>

          {selectedSymptoms.length > 0 && (
            <div className="selected-summary">
              <p>Selected: {selectedSymptoms.length} symptom(s)</p>
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="predict-btn"
              disabled={predicting || selectedSymptoms.length === 0}
            >
              {predicting ? 'Analyzing...' : 'Predict Disease'}
            </button>

            {selectedSymptoms.length > 0 && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setSelectedSymptoms([])}
              >
                Clear Selection
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Home;