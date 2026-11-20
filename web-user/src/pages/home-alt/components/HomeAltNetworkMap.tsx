import { useEffect, useRef } from 'react';
import {
  NETWORK_MAP_DOTS,
  NETWORK_MAP_NODES,
  NETWORK_MAP_ROUTES,
  NETWORK_MAP_SEED,
} from '../constants/networkMapData';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SPARK_PALETTE = ['#5d83ff', '#7564ff', '#9874ff', '#d1c9ff'];

function createSeededRandom(initialSeed: number): () => number {
  let seed = initialSeed;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

interface HomeAltNetworkMapProps {
  ariaLabel: string;
}

export function HomeAltNetworkMap({ ariaLabel }: HomeAltNetworkMapProps) {
  const mapDotsRef = useRef<SVGGElement>(null);
  const routesRef = useRef<SVGGElement>(null);
  const nodesRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const mapDots = mapDotsRef.current;
    const routesLayer = routesRef.current;
    const nodesLayer = nodesRef.current;
    if (!mapDots || !routesLayer || !nodesLayer) {
      return undefined;
    }

    const random = createSeededRandom(NETWORK_MAP_SEED);
    const fragment = document.createDocumentFragment();

    for (const [x, y] of NETWORK_MAP_DOTS) {
      const jitterX = (random() - 0.5) * 1.8;
      const jitterY = (random() - 0.5) * 1.8;
      const circle = document.createElementNS(SVG_NS, 'circle');
      const radius = 1.25 + random() * 0.75;
      const base = 0.24 + random() * 0.2;
      circle.setAttribute('cx', (x + jitterX).toFixed(2));
      circle.setAttribute('cy', (y + jitterY).toFixed(2));
      circle.setAttribute('r', radius.toFixed(2));
      circle.classList.add('map-dot');
      circle.style.setProperty('--base-opacity', base.toFixed(2));
      circle.style.setProperty('--peak-opacity', (0.58 + random() * 0.34).toFixed(2));

      if (random() < 0.19) {
        circle.classList.add('is-alive');
        circle.style.setProperty('--duration', `${(3.8 + random() * 3.8).toFixed(2)}s`);
        circle.style.setProperty('--delay', `${(-random() * 7).toFixed(2)}s`);
      }
      fragment.appendChild(circle);
    }
    mapDots.appendChild(fragment);

    NETWORK_MAP_ROUTES.forEach(({ start, control, end, delay, opacity, low, width, trail }) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M ${start[0]} ${start[1]} Q ${control[0]} ${control[1]} ${end[0]} ${end[1]}`);
      path.setAttribute('pathLength', '600');
      path.setAttribute('class', 'route-segment');
      path.style.setProperty('--route-duration', '11.4s');
      path.style.setProperty('--route-delay', `${delay}s`);
      path.style.setProperty('--route-opacity', String(opacity));
      path.style.setProperty('--route-opacity-low', String(low));
      path.style.setProperty('--route-width', `${width}px`);
      path.style.setProperty('--trail-length', String(trail));
      routesLayer.appendChild(path);
    });

    NETWORK_MAP_NODES.forEach((node, nodeIndex) => {
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('transform', `translate(${node.x} ${node.y})`);
      group.style.setProperty('--node-delay', `${node.delay}s`);

      const core = document.createElementNS(SVG_NS, 'circle');
      core.setAttribute('r', '3.4');
      core.setAttribute('class', 'node-core');
      group.appendChild(core);

      const sparkCount = 9 + (nodeIndex % 5);
      for (let i = 0; i < sparkCount; i += 1) {
        const angle = (Math.PI * 2 * i) / sparkCount + random() * 0.32;
        const distance = 18 + random() * 30;
        const spark = document.createElementNS(SVG_NS, 'circle');
        spark.setAttribute('r', (1 + random() * 1.2).toFixed(1));
        spark.setAttribute('class', 'spark');
        spark.style.setProperty('--dx', `${(Math.cos(angle) * distance).toFixed(1)}px`);
        spark.style.setProperty('--dy', `${(Math.sin(angle) * distance).toFixed(1)}px`);
        spark.style.setProperty('--spark-color', SPARK_PALETTE[i % SPARK_PALETTE.length]);
        spark.style.setProperty('--spark-delay', `${node.delay + random() * 0.12}s`);
        group.appendChild(spark);
      }
      nodesLayer.appendChild(group);
    });

    return () => {
      mapDots.replaceChildren();
      routesLayer.replaceChildren();
      nodesLayer.replaceChildren();
    };
  }, []);

  return (
    <svg
      className="home-alt-network-map"
      viewBox="0 0 1720 672"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id="home-alt-routeGradient" x1="0" x2="1">
          <stop offset="0" stopColor="#76a6ff" stopOpacity=".12" />
          <stop offset=".5" stopColor="#675bff" stopOpacity="1" />
          <stop offset="1" stopColor="#a86fff" stopOpacity=".16" />
        </linearGradient>
        <linearGradient id="home-alt-flowGradient" x1="0" x2="1">
          <stop offset="0" stopColor="#5b8cff" stopOpacity=".08" />
          <stop offset=".7" stopColor="#5f52ff" />
          <stop offset="1" stopColor="#f2edff" />
        </linearGradient>
        <filter id="home-alt-softGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="home-alt-nodeGlow" x="-500%" y="-500%" width="1000%" height="1000%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feFlood floodColor="#7165ff" floodOpacity=".7" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="home-alt-clearBlur" x="-20%" y="-30%" width="140%" height="160%">
          <feGaussianBlur stdDeviation="42" />
        </filter>
        <mask id="home-alt-contentClearMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1720" height="672">
          <rect width="1720" height="672" fill="white" />
          <rect x="390" y="45" width="940" height="455" rx="155" fill="#989898" filter="url(#home-alt-clearBlur)" />
        </mask>
      </defs>
      <g mask="url(#home-alt-contentClearMask)">
        <g ref={mapDotsRef} className="map-dots" />
        <g ref={routesRef} />
        <g ref={nodesRef} />
      </g>
    </svg>
  );
}
