"use client";

import type { ReactNode, SVGProps } from "react";
import * as Flags from "country-flag-icons/react/3x2";

type PackFlag = typeof Flags.DZ;

function SvgLegacy(props: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg
      viewBox="0 0 3 2"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      {...rest}
    >
      {children}
    </svg>
  );
}

function EastGermanyFlag(p: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <SvgLegacy {...p}>
      <rect width="3" height="0.67" y="0" fill="#000" />
      <rect width="3" height="0.66" y="0.67" fill="#DD0000" />
      <rect width="3" height="0.67" y="1.33" fill="#FFCE00" />
    </SvgLegacy>
  );
}

function SovietUnionFlag(p: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <SvgLegacy {...p}>
      <rect width="3" height="2" fill="#CC0000" />
      <polygon points="0.35,0.25 0.5,0.55 0.2,0.4 0.5,0.4 0.2,0.55" fill="#FFD700" />
    </SvgLegacy>
  );
}

function YugoslaviaFlag(p: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <SvgLegacy {...p}>
      <rect width="1" height="2" x="0" fill="#003893" />
      <rect width="1" height="2" x="1" fill="#FFFFFF" />
      <rect width="1" height="2" x="2" fill="#CE1126" />
    </SvgLegacy>
  );
}

/** FIFA / World Cup participant name → `country-flag-icons` export or legacy SVG. */
const FLAG_BY_COUNTRY: Record<string, PackFlag> = {
  Algeria: Flags.DZ,
  Angola: Flags.AO,
  Argentina: Flags.AR,
  Australia: Flags.AU,
  Austria: Flags.AT,
  Belgium: Flags.BE,
  Bolivia: Flags.BO,
  "Bosnia and Herzegovina": Flags.BA,
  Brazil: Flags.BR,
  Bulgaria: Flags.BG,
  Cameroon: Flags.CM,
  Canada: Flags.CA,
  Chile: Flags.CL,
  China: Flags.CN,
  "Chinese Taipei": Flags.TW,
  Colombia: Flags.CO,
  "Costa Rica": Flags.CR,
  Croatia: Flags.HR,
  Cuba: Flags.CU,
  "Czech Republic": Flags.CZ,
  Czechoslovakia: Flags.CZ,
  Denmark: Flags.DK,
  "Dutch East Indies": Flags.ID,
  "East Germany": EastGermanyFlag as unknown as PackFlag,
  Ecuador: Flags.EC,
  Egypt: Flags.EG,
  "El Salvador": Flags.SV,
  England: Flags.GB_ENG,
  "Equatorial Guinea": Flags.GQ,
  France: Flags.FR,
  Germany: Flags.DE,
  Ghana: Flags.GH,
  Greece: Flags.GR,
  Haiti: Flags.HT,
  Honduras: Flags.HN,
  Hungary: Flags.HU,
  Iceland: Flags.IS,
  India: Flags.IN,
  Iran: Flags.IR,
  Iraq: Flags.IQ,
  Italy: Flags.IT,
  "Ivory Coast": Flags.CI,
  Jamaica: Flags.JM,
  Japan: Flags.JP,
  Kuwait: Flags.KW,
  Mexico: Flags.MX,
  Morocco: Flags.MA,
  Netherlands: Flags.NL,
  "New Zealand": Flags.NZ,
  Nigeria: Flags.NG,
  "North Korea": Flags.KP,
  "Northern Ireland": Flags.GB_NIR,
  Norway: Flags.NO,
  Panama: Flags.PA,
  Paraguay: Flags.PY,
  Philippines: Flags.PH,
  Peru: Flags.PE,
  Poland: Flags.PL,
  Portugal: Flags.PT,
  Qatar: Flags.QA,
  "Republic of Ireland": Flags.IE,
  Romania: Flags.RO,
  Russia: Flags.RU,
  "Saudi Arabia": Flags.SA,
  Scotland: Flags.GB_SCT,
  Senegal: Flags.SN,
  Serbia: Flags.RS,
  "Serbia and Montenegro": Flags.RS,
  Slovakia: Flags.SK,
  Slovenia: Flags.SI,
  "South Africa": Flags.ZA,
  "South Korea": Flags.KR,
  "Soviet Union": SovietUnionFlag as unknown as PackFlag,
  Spain: Flags.ES,
  Sweden: Flags.SE,
  Switzerland: Flags.CH,
  Thailand: Flags.TH,
  Togo: Flags.TG,
  "Trinidad and Tobago": Flags.TT,
  Tunisia: Flags.TN,
  Turkey: Flags.TR,
  Ukraine: Flags.UA,
  "United Arab Emirates": Flags.AE,
  "United States": Flags.US,
  Uruguay: Flags.UY,
  Vietnam: Flags.VN,
  Wales: Flags.GB_WLS,
  "West Germany": Flags.DE,
  Yugoslavia: YugoslaviaFlag as unknown as PackFlag,
  Zaire: Flags.CD,
  Zambia: Flags.ZM,
};

export type CountryFlagSvgProps = SVGProps<SVGSVGElement> & {
  country: string;
};

function initials(country: string): string {
  const parts = country.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0] + parts[1]![0]).toUpperCase();
  return country.slice(0, 3).toUpperCase();
}

export function CountryFlagSvg({ country, ...rest }: CountryFlagSvgProps) {
  const Flag = FLAG_BY_COUNTRY[country];
  const packProps = rest as unknown as React.ComponentProps<PackFlag>;
  if (!Flag) {
    return (
      <svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg" {...rest}>
        <rect width="3" height="2" fill="#e5e7eb" />
        <text
          x="1.5"
          y="1.15"
          textAnchor="middle"
          fontSize="0.55"
          fontWeight="700"
          fill="#374151"
          fontFamily="system-ui, sans-serif"
        >
          {initials(country)}
        </text>
      </svg>
    );
  }
  return <Flag title={country} {...packProps} />;
}
