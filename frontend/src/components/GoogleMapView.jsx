import { GoogleMap, MarkerF, InfoWindowF } from "@react-google-maps/api";
import { useState } from "react";

const containerStyle = {
  width: "100%",
  height: "400px",
};

export default function GoogleMapView({
  userLocation,
  places,
}) {
  const [activePlace, setActivePlace] = useState(null);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={userLocation}
      zoom={13}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        mapId: "healthcare_map" // Add Map ID
      }}
    >
      {/* USER LOCATION - Using MarkerF */}
      <MarkerF
        position={userLocation}
        icon={{
          url: "https://maps.gstatic.com/mapfiles/ms2/micons/blue-dot.png",
          scaledSize: new window.google.maps.Size(32, 32)
        }}
        title="Your Location"
      />

      {/* NEARBY PLACES - Using MarkerF */}
      {places.map((place) => (
        <MarkerF
          key={place.id}
          position={{ lat: place.lat, lng: place.lng }}
          onClick={() => setActivePlace(place)}
          title={place.name}
        />
      ))}

      {/* InfoWindow - Using InfoWindowF */}
      {activePlace && (
        <InfoWindowF
          position={{ lat: activePlace.lat, lng: activePlace.lng }}
          onCloseClick={() => setActivePlace(null)}
        >
          <div>
            <strong>{activePlace.name}</strong>
            <br />
            {activePlace.address}
          </div>
        </InfoWindowF>
      )}
    </GoogleMap>
  );
}