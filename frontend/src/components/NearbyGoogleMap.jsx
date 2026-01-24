import { GoogleMap, Marker, InfoWindow } from "@react-google-maps/api";
import { useMemo, useState } from "react";

const containerStyle = {
  width: "100%",
  height: "400px",
  borderRadius: "12px"
};

export default function NearbyGoogleMap({ userLocation, places }) {
  const [activePlace, setActivePlace] = useState(null);

  const bounds = useMemo(() => {
    if (!userLocation) return null;
    const b = new window.google.maps.LatLngBounds();
    b.extend(userLocation);
    places.forEach(p => b.extend({ lat: p.lat, lng: p.lng }));
    return b;
  }, [userLocation, places]);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      zoom={13}
      center={userLocation}
      onLoad={map => bounds && map.fitBounds(bounds)}
      options={{
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        gestureHandling: "greedy"
      }}
    >
      {/* USER LOCATION */}
      <Marker
        position={userLocation}
        icon="https://maps.gstatic.com/mapfiles/ms2/micons/blue-dot.png"
      />

      {/* NEARBY PLACES */}
      {places.map(place => (
        <Marker
          key={place.id}
          position={{ lat: place.lat, lng: place.lng }}
          onClick={() => setActivePlace(place)}
        />
      ))}

      {activePlace && (
        <InfoWindow
          position={{ lat: activePlace.lat, lng: activePlace.lng }}
          onCloseClick={() => setActivePlace(null)}
        >
          <div style={{ maxWidth: 200 }}>
            <strong>{activePlace.name}</strong>
            <br />
            <small>{activePlace.address}</small>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
