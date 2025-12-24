/**
 * Interactive 3D Globe component using CesiumJS
 * Real OpenStreetMap tiles with street-level detail
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { VisitorInfo, GlobePoint } from '../types';

interface GlobeComponentProps {
  visitors: VisitorInfo[];
  currentVisitorId: string | null;
  onVisitorClick: (visitor: VisitorInfo) => void;
}

// Color palette
const YELLOW = Cesium.Color.fromCssColorString('#FFE500');
const BLACK = Cesium.Color.BLACK;

/** Convert visitor to globe point */
function visitorToPoint(visitor: VisitorInfo, isCurrentUser: boolean): GlobePoint | null {
  if (!visitor.server.geo) return null;

  return {
    id: visitor.id,
    lat: visitor.server.geo.lat,
    lng: visitor.server.geo.lng,
    size: isCurrentUser ? 1.0 : 0.5,
    color: isCurrentUser ? '#FFE500' : '#000000',
    visitor,
  };
}

export function Globe({ visitors, currentVisitorId, onVisitorClick }: GlobeComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map());
  const arcEntitiesRef = useRef<Cesium.Entity[]>([]);
  const pulseEntityRef = useRef<Cesium.Entity | null>(null);
  const onVisitorClickRef = useRef(onVisitorClick);

  // Keep callback ref updated
  useEffect(() => {
    onVisitorClickRef.current = onVisitorClick;
  }, [onVisitorClick]);

  // Initialize Cesium viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    // Create viewer with minimal UI
    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: false,
      shouldAnimate: true,
    });

    // Remove default imagery and add OSM
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      })
    );

    // Remove Cesium credits (or style them)
    const creditContainer = viewer.cesiumWidget.creditContainer as HTMLElement;
    creditContainer.style.display = 'none';

    // Set initial camera view
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 20, 20000000),
    });

    // Configure scene - white background
    viewer.scene.backgroundColor = Cesium.Color.WHITE;
    viewer.scene.globe.enableLighting = false; // Keep globe evenly lit
    viewer.scene.fog.enabled = false;
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;

    // Disable atmosphere
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = false;
    }
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.globe.baseColor = Cesium.Color.WHITE;

    // Make globe crisp
    viewer.scene.globe.maximumScreenSpaceError = 1;

    // Enable zoom and other controls explicitly
    viewer.scene.screenSpaceCameraController.enableZoom = true;
    viewer.scene.screenSpaceCameraController.enableRotate = true;
    viewer.scene.screenSpaceCameraController.enableTilt = true;
    viewer.scene.screenSpaceCameraController.enableLook = true;

    // Enable pinch zoom for trackpad on Mac
    viewer.scene.screenSpaceCameraController.zoomEventTypes = [
      Cesium.CameraEventType.WHEEL,
      Cesium.CameraEventType.PINCH,
    ];
    viewer.scene.screenSpaceCameraController.tiltEventTypes = [
      Cesium.CameraEventType.PINCH,
      Cesium.CameraEventType.RIGHT_DRAG,
    ];

    // Increase zoom speed for mouse wheel and pinch
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1000;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 50000000;
    (viewer.scene.screenSpaceCameraController as { zoomFactor: number }).zoomFactor = 10; // Faster zoom

    // Handle trackpad pinch zoom (reported as wheel + ctrlKey in browsers)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomAmount = -e.deltaY * 0.01; // Negative to fix direction
        const camera = viewer.camera;
        const cameraHeight = camera.positionCartographic.height;
        const zoomFactor = cameraHeight * zoomAmount * 0.5; // Increased from 0.1 for faster zoom
        camera.zoomIn(zoomFactor);
      }
    };
    viewer.canvas.addEventListener('wheel', handleWheel, { passive: false });

    // Auto-rotate (only when user is not interacting)
    let lastTime = Date.now();
    let isUserInteracting = false;
    let isViewingVisitor = false;
    let resumeTimeout: ReturnType<typeof setTimeout> | null = null;

    const rotate = () => {
      if (isUserInteracting || isViewingVisitor) return;
      const now = Date.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, delta * 0.05);
    };

    viewer.clock.onTick.addEventListener(rotate);

    // Handle entity clicks and hover - use ref to avoid recreating viewer
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const canvas = viewer.scene.canvas;

    const pauseRotation = () => {
      isUserInteracting = true;
      lastTime = Date.now();
      if (resumeTimeout) clearTimeout(resumeTimeout);
    };

    const scheduleResumeRotation = () => {
      if (resumeTimeout) clearTimeout(resumeTimeout);
      resumeTimeout = setTimeout(() => {
        if (!isViewingVisitor) {
          isUserInteracting = false;
          lastTime = Date.now();
        }
      }, 3000);
    };

    // Pause rotation during user interaction
    handler.setInputAction(pauseRotation, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(pauseRotation, Cesium.ScreenSpaceEventType.RIGHT_DOWN);
    handler.setInputAction(pauseRotation, Cesium.ScreenSpaceEventType.MIDDLE_DOWN);
    handler.setInputAction(pauseRotation, Cesium.ScreenSpaceEventType.WHEEL);

    handler.setInputAction(scheduleResumeRotation, Cesium.ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction(scheduleResumeRotation, Cesium.ScreenSpaceEventType.RIGHT_UP);
    handler.setInputAction(scheduleResumeRotation, Cesium.ScreenSpaceEventType.MIDDLE_UP);

    // Change cursor on hover over entities
    handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.endPosition);
      if (Cesium.defined(picked) && picked.id && picked.id.properties?.visitor) {
        canvas.style.cursor = 'pointer';
      } else {
        canvas.style.cursor = 'default';
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && picked.id && picked.id.properties) {
        const visitorData = picked.id.properties.visitor?.getValue();
        if (visitorData) {
          // Toggle viewing visitor - stop rotation while viewing
          isViewingVisitor = !isViewingVisitor;
          if (resumeTimeout) clearTimeout(resumeTimeout);
          onVisitorClickRef.current(visitorData);
        }
      } else {
        // Clicked elsewhere - resume rotation
        isViewingVisitor = false;
        scheduleResumeRotation();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;

    return () => {
      viewer.canvas.removeEventListener('wheel', handleWheel);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []); // Empty deps - only initialize once

  // Update visitor points
  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    const currentEntities = entitiesRef.current;

    // Clean up old arc entities
    arcEntitiesRef.current.forEach(entity => {
      viewer.entities.remove(entity);
    });
    arcEntitiesRef.current = [];

    // Clean up old pulse entity
    if (pulseEntityRef.current) {
      viewer.entities.remove(pulseEntityRef.current);
      pulseEntityRef.current = null;
    }

    // Convert visitors to points
    const points = visitors
      .map((v) => visitorToPoint(v, v.id === currentVisitorId))
      .filter((p): p is GlobePoint => p !== null);

    // Remove old visitor entities
    const currentIds = new Set(points.map(p => p.id));
    for (const [id, entity] of currentEntities) {
      if (!currentIds.has(id)) {
        viewer.entities.remove(entity);
        currentEntities.delete(id);
      }
    }

    // Add/update entities
    points.forEach((point) => {
      const isCurrentUser = point.id === currentVisitorId;
      const color = isCurrentUser ? YELLOW : BLACK;
      const size = isCurrentUser ? 15 : 10;

      if (currentEntities.has(point.id)) {
        // Update existing
        const entity = currentEntities.get(point.id)!;
        entity.position = Cesium.Cartesian3.fromDegrees(point.lng, point.lat) as unknown as Cesium.PositionProperty;
        if (entity.point) {
          entity.point.color = new Cesium.ConstantProperty(color);
          entity.point.pixelSize = new Cesium.ConstantProperty(size);
        }
      } else {
        // Create new entity
        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat),
          point: {
            pixelSize: size,
            color: color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          properties: {
            visitor: point.visitor,
          },
        });
        currentEntities.set(point.id, entity);
      }

      // Add pulsing effect for current user
      if (isCurrentUser) {
        const pulseEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat),
          ellipse: {
            semiMinorAxis: 50000,
            semiMajorAxis: 50000,
            material: Cesium.Color.fromCssColorString('#FFE500').withAlpha(0.3),
            outline: true,
            outlineColor: YELLOW,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
        pulseEntityRef.current = pulseEntity;
      }
    });

    // Draw arcs between current user and others
    if (currentVisitorId) {
      const currentPoint = points.find(p => p.id === currentVisitorId);
      if (currentPoint) {
        points.forEach(point => {
          if (point.id !== currentVisitorId) {
            const arcEntity = viewer.entities.add({
              polyline: {
                positions: Cesium.Cartesian3.fromDegreesArray([
                  currentPoint.lng, currentPoint.lat,
                  point.lng, point.lat,
                ]),
                width: 2,
                material: new Cesium.PolylineGlowMaterialProperty({
                  glowPower: 0.2,
                  color: YELLOW,
                }),
                arcType: Cesium.ArcType.GEODESIC,
              },
            });
            arcEntitiesRef.current.push(arcEntity);
          }
        });
      }
    }
  }, [visitors, currentVisitorId]);

  return (
    <div
      ref={containerRef}
      className="globe-wrapper"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
