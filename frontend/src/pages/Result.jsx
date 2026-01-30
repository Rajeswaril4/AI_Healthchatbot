import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GoogleMap, MarkerF, InfoWindowF } from "@react-google-maps/api";
import {
  Stethoscope,
  BarChart3,
  AlertTriangle,
  Printer,
  History,
  MapPin,
  Navigation,
  RefreshCcw,
  Loader
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import "../styles/Result.css";

const mapContainerStyle = {
  width: "100%",
  height: "400px",
  borderRadius: "12px"
};

const Result = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api } = useAuth();

  const [predictionData, setPredictionData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [userLocation, setUserLocation] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [activePlace, setActivePlace] = useState(null);

  const [showMap, setShowMap] = useState(false);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [autoSearchAttempted, setAutoSearchAttempted] = useState(false);

  const [manualLocation, setManualLocation] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  /* ================= LOAD RESULT ================= */
  useEffect(() => {
    if (location.state?.prediction) {
      setPredictionData(location.state.prediction);
    } else if (location.state?.result) {
      setPredictionData(location.state.result);
    } else {
      navigate("/", { replace: true });
    }
    setLoading(false);
  }, [location, navigate]);

  /* ================= AUTO-SEARCH ON LOAD ================= */
  useEffect(() => {
    // Auto-search for nearby hospitals when prediction data is loaded
    if (predictionData && !autoSearchAttempted) {
      setAutoSearchAttempted(true);
      console.log("🗺️ Auto-searching for nearby hospitals...");
      handleFindNearby();
    }
  }, [predictionData, autoSearchAttempted]);

  const formatConfidence = (value) => {
    if (!value) return null;
    return (value <= 1 ? value * 100 : value).toFixed(1);
  };

  /* ================= AUTO LOCATION ================= */
  const handleFindNearby = () => {
    setLocationError("");
    setLoadingNearby(true);

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser. Please enter your location manually below.");
      setLoadingNearby(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        setUserLocation({ lat: latitude, lng: longitude });
        await fetchNearby(latitude, longitude);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError(
              "📍 Location permission denied. Please allow location access or enter your city/pincode below to find nearby hospitals."
            );
            break;
          case error.TIMEOUT:
            setLocationError("⏱️ Location request timed out. Please try again or enter your location manually.");
            break;
          default:
            setLocationError("❌ Unable to get your location. Please enter your city/pincode below.");
        }
        setLoadingNearby(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  /* ================= MANUAL LOCATION ================= */
  const handleManualLocationSearch = async () => {
    if (!manualLocation.trim()) {
      setLocationError("Please enter a city name or pincode.");
      return;
    }

    setManualLoading(true);
    setLocationError("");

    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        manualLocation
      )}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;

      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();

      if (geoData.status !== "OK") {
        setLocationError("Location not found. Try another city or pincode.");
        setManualLoading(false);
        return;
      }

      const { lat, lng } = geoData.results[0].geometry.location;
      setUserLocation({ lat, lng });
      await fetchNearby(lat, lng);
    } catch {
      setLocationError("Failed to search location. Please try again.");
    } finally {
      setManualLoading(false);
    }
  };

  /* ================= FETCH NEARBY ================= */
  const fetchNearby = async (lat, lng) => {
    try {
      const specialist = predictionData?.specialist || "hospital";

      console.log(`🔍 Searching for ${specialist} near (${lat}, ${lng})`);

      const response = await api.get("/nearby", {
        params: { lat, lng, radius: 5000, specialist }
      });

      if (response.data.ok) {
        const places = response.data.places || [];
        setNearbyPlaces(places);
        setShowMap(true);
        
        if (places.length > 0) {
          console.log(`✅ Found ${places.length} nearby facilities`);
          setLocationError("");
        } else {
          setLocationError(`No ${specialist} facilities found within 5km. Try increasing search radius or enter a different location.`);
        }
      } else {
        setLocationError("No nearby healthcare facilities found.");
      }
    } catch (err) {
      console.error("Nearby fetch error:", err);
      setLocationError("Failed to fetch nearby specialists. Please try again.");
    } finally {
      setLoadingNearby(false);
    }
  };

  if (loading || !predictionData) {
    return <div className="loading-spinner">Loading results…</div>;
  }

  const {
    disease,
    description,
    precautions,
    specialist,
    confidence,
    conf_num
  } = predictionData;

  const confidencePercent = formatConfidence(confidence || conf_num);

  /* ================= RENDER ================= */
  return (
    <div className="result-container">
      <div className="result-card">
        <h1 className="disease-name">{disease}</h1>

        <div className="meta-row">
          {specialist && (
            <div className="meta-item">
              <Stethoscope size={18} /> {specialist}
            </div>
          )}
          {confidencePercent && (
            <div className="meta-item">
              <BarChart3 size={18} /> {confidencePercent}%
            </div>
          )}
        </div>

        <p>{description}</p>

        {precautions?.length > 0 && (
          <ul className="precautions">
            {precautions.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}

        <div className="actions">
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            New Prediction
          </button>
          <button className="btn btn-outline" onClick={() => navigate("/history")}>
            <History size={16} /> History
          </button>
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
        </div>

        {/* ===== NEARBY HOSPITALS ===== */}
        <div className="nearby-section">
          <h3>
            <MapPin size={18} /> Nearby {specialist || "Healthcare Facilities"}
          </h3>

          {loadingNearby && !showMap && (
            <div className="auto-search-message">
              <Loader className="spinning" size={20} />
              <span>Automatically searching for nearby hospitals based on your location...</span>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleFindNearby}
            disabled={loadingNearby}
          >
            <MapPin size={16} />
            {loadingNearby ? "Searching..." : showMap ? "Refresh Results" : "Find Nearby Hospitals"}
          </button>

          {locationError && (
            <div className="location-error">
              <AlertTriangle size={16} />
              <span>{locationError}</span>
              {!showMap && (
                <button className="retry-btn" onClick={handleFindNearby}>
                  <RefreshCcw size={14} /> Retry
                </button>
              )}
            </div>
          )}

          {/* MANUAL INPUT */}
          <div className="manual-location-box">
            <p>Or enter your city / pincode:</p>
            <div className="manual-input-row">
              <input
                type="text"
                placeholder="e.g. Hyderabad, Mumbai, 500081"
                value={manualLocation}
                onChange={(e) => setManualLocation(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleManualLocationSearch();
                  }
                }}
              />
              <button
                className="btn btn-outline"
                onClick={handleManualLocationSearch}
                disabled={manualLoading}
              >
                {manualLoading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          {/* SUCCESS MESSAGE */}
          {showMap && nearbyPlaces.length > 0 && (
            <div className="success-message">
              ✅ Found {nearbyPlaces.length} {specialist || "healthcare"} {nearbyPlaces.length === 1 ? 'facility' : 'facilities'} near you
            </div>
          )}

          {/* MAP */}
          {showMap && userLocation && (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={userLocation}
              zoom={13}
              options={{
                mapId: "healthcare_map"
              }}
            >
              {/* User Location */}
              <MarkerF
                position={userLocation}
                icon={{
                  url: "https://maps.gstatic.com/mapfiles/ms2/micons/blue-dot.png",
                  scaledSize: new window.google.maps.Size(32, 32)
                }}
                title="Your Location"
              />

              {/* Nearby Places */}
              {nearbyPlaces.map((p) => (
                <MarkerF
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  onClick={() => setActivePlace(p)}
                  title={p.name}
                />
              ))}

              {/* InfoWindow */}
              {activePlace && (
                <InfoWindowF
                  position={{ lat: activePlace.lat, lng: activePlace.lng }}
                  onCloseClick={() => setActivePlace(null)}
                >
                  <div>
                    <strong>{activePlace.name}</strong>
                    <br />
                    <small>{activePlace.address}</small>
                    <br />
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${activePlace.lat},${activePlace.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#4a90e2', fontWeight: 600 }}
                    >
                      <Navigation size={14} /> Get Directions
                    </a>
                  </div>
                </InfoWindowF>
              )}
            </GoogleMap>
          )}

          {/* PLACES LIST */}
          {showMap && nearbyPlaces.length > 0 && (
            <div className="places-list-section">
              <h4>📍 Nearby Facilities ({nearbyPlaces.length})</h4>
              <div className="places-compact-list">
                {nearbyPlaces.slice(0, 5).map((place, idx) => (
                  <div 
                    key={place.id} 
                    className="place-item-compact"
                    onClick={() => setActivePlace(place)}
                  >
                    <span className="place-number">{idx + 1}</span>
                    <div className="place-info-compact">
                      <strong>{place.name}</strong>
                      {place.address && <small>{place.address}</small>}
                    </div>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="directions-link-compact"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Navigation size={14} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Result;