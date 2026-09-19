import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger('JwtStrategy');

  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'shawarmaguys-secret-key-12345',
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userLocations: true,
      },
    });
    if (!user || !user.isActive) {
      this.logger.warn(
        `[JwtStrategy] Authentication failed for sub="${payload.sub}" (user inactive or not found)`,
      );
      throw new UnauthorizedException('User is inactive or does not exist');
    }
    this.logger.debug(
      `[JwtStrategy] User authenticated: ${user.id} (${user.email}, role: ${user.role}, locations: ${user.userLocations?.length || 0})`,
    );
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      userLocations: user.userLocations || [],
    };
  }
}
