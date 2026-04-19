"use client";

import { CountryFlagSvg } from "@/components/CountryFlagSvg";
import type { CompetitionMode } from "@/lib/worldCup";
import { forwardRef, useMemo } from "react";
import styles from "./StickerCard.module.css";

export type StickerCardProps = {
  imageSrc: string;
  displayName: string;
  country: string;
  year: number;
  position: string;
  competitionMode?: CompetitionMode;
  imagePending?: boolean;
  className?: string;
};

const StickerCard = forwardRef<HTMLDivElement, StickerCardProps>(function StickerCard(
  { imageSrc, displayName, country, year, position, competitionMode = "men", imagePending = false, className },
  ref
) {
  const stickerNumber = useMemo(() => {
    const seed = `${displayName}${country}${year}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
    return (h % 450) + 1;
  }, [displayName, country, year]);

  const tournamentLabel =
    competitionMode === "women" ? "FIFA Women's World Cup" : "FIFA World Cup";

  return (
    <div ref={ref} className={`${styles.root} ${className ?? ""}`.trim()}>
      <div className={styles.inner}>

        {/* ── Top band ── */}
        <div className={styles.topBand}>
          <div className={styles.topLeft}>
            <span className={styles.topBall}>⚽</span>
            <span className={styles.tournamentLabel}>{tournamentLabel}</span>
          </div>
          <span className={styles.yearBadge}>{year}</span>
        </div>

        {/* ── Photo ── */}
        <div className={styles.photoWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`${styles.photo} ${imagePending ? styles.photoPending : styles.photoReveal}`}
            src={imageSrc}
            alt=""
          />
          <div className={styles.flagWrap} aria-hidden>
            <CountryFlagSvg className={styles.flag} country={country} width={48} height={32} />
          </div>
          <div className={styles.stickerNum} aria-hidden>#{stickerNumber}</div>
        </div>

        {/* ── Bottom panel ── */}
        <div className={styles.bottomPanel}>
          <p className={styles.name}>{displayName}</p>
          <div className={styles.metaRow}>
            <span className={styles.position}>{position}</span>
            <div className={styles.countryRow}>
              <CountryFlagSvg country={country} width={18} height={12} className={styles.metaFlag} />
              <span className={styles.country}>{country}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
});

export default StickerCard;
