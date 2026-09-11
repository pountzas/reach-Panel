import { Flag } from 'svg-flags';

type Props = {
  country: string;
  size?: number;
};

export function CountryFlag({ country, size = 20 }: Props) {
  return (
    <Flag
      country={country}
      width={size}
      height={Math.round(size * 0.75)}
      showBorder
      borderWidth={1}
    />
  );
}
