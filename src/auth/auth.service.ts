import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    this.logger.log(`[AuthService] Login attempt for email: "${email}"`);
    
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { userLocations: true }
    });

    if (!user || !user.isActive) {
      this.logger.warn(`[AuthService] Login rejected: user "${email}" not found or inactive`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`[AuthService] Login rejected: invalid credentials for "${email}"`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate JWT
    const payload = { email: user.email, sub: user.id, role: user.role };
    this.logger.log(
      `[AuthService] Login successful for user "${user.id}" (${user.email}, role: ${user.role}, locations: ${user.userLocations.length})`,
    );

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        locationIds: user.userLocations.map(ul => ul.locationId)
      },
    };
  }
}
